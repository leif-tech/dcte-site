const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PayMongo API key (set in Railway environment variables)
const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create PayMongo Checkout Session
app.post('/api/checkout', async (req, res) => {
  const { name, price, quantity = 1 } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Product name and price are required' });
  }

  if (!PAYMONGO_SECRET) {
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  try {
    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(PAYMONGO_SECRET + ':').toString('base64')
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{
              name: name,
              quantity: quantity,
              amount: Math.round(price * 100), // PayMongo uses centavos
              currency: 'PHP',
              description: 'DCTE - ' + name
            }],
            payment_method_types: [
              'gcash',
              'grab_pay',
              'paymaya',
              'card',
              'dob',
              'dob_ubp',
              'billease',
              'atome'
            ],
            description: 'DCTE Purchase - ' + name,
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            success_url: req.protocol + '://' + req.get('host') + '/checkout-success.html',
            cancel_url: req.protocol + '://' + req.get('host') + '/'
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PayMongo error:', JSON.stringify(data));
      return res.status(response.status).json({ error: data.errors?.[0]?.detail || 'Payment creation failed' });
    }

    const checkoutUrl = data.data.attributes.checkout_url;
    res.json({ checkout_url: checkoutUrl });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Catch-all: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DCTE server running on port ${PORT}`);
});
