const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const ejs = require('ejs');
const db = require('./db'); // Use shared DB connection
const nodemailer = require('nodemailer'); // For sending emails
const app = express();

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

// Route handlers
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const lostRoutes = require('./routes/lost');
app.use('/lost', lostRoutes); // All lost item routes prefixed with /lost

const foundRoutes = require('./routes/found');
app.use('/found', foundRoutes); // All found item routes prefixed with /found

const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const claimRoutes = require('./routes/claim');
app.use('/claim', claimRoutes);

// Homepage route
app.get('/', (req, res) => {
  if (req.session.user) {
    const userId = req.session.user.id;
    
    // Fetch lost items
    db.query('SELECT * FROM lost_items ORDER BY date_lost DESC', (err, lostItems) => {
      if (err) {
        console.error('Error fetching lost items:', err);
        return res.status(500).send('Error loading page');
      }

      // Fetch found items
      db.query('SELECT * FROM found_items ORDER BY date_found DESC', (err, foundItems) => {
        if (err) {
          console.error('Error fetching found items:', err);
          return res.status(500).send('Error loading page');
        }

        // Fetch claimed items for the logged-in user
db.query(
  'SELECT item_id, item_type FROM claims WHERE user_id = ? AND claim_status = "claimed"',
  [userId],
  (err, claimedRows) => {
    if (err) {
      console.error('Error fetching claimed items:', err);
      return res.status(500).send('Error loading page');
    }

    const claimedItems = {
      lost: claimedRows.filter(row => row.item_type === 'lost').map(row => row.item_id),
      found: claimedRows.filter(row => row.item_type === 'found').map(row => row.item_id)
    };

    res.render('index', {
      user: req.session.user.name,
      lostItems,
      foundItems,
      claimedItems
    });
  }
);
      });
    });
  } else {
    res.redirect('/login.html');
  }
});


// Function to send email notifications
const sendEmailNotification = (to, subject, text) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail', // You can use other services
    auth: {
      user: 'your-email@gmail.com',
      pass: 'your-email-password'
    }
  });

  const mailOptions = {
    from: 'your-email@gmail.com',
    to: to,
    subject: subject,
    text: text
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('Error sending email:', err);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.statusCode || 500).json({ message: err.message || "Internal Server Error" });
});

// Start server
app.listen(3000, () => console.log('Server running on http://localhost:3000'));
