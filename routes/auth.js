const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const sendOTPEmail = require('../utils/mailer');
const router = express.Router();

const otpStore = {}; // Temporary in-memory OTP store

// POST: Register route — generates OTP & sends email
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).send('Database error');
    if (results.length > 0) return res.send('User already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    otpStore[email] = {
      name,
      hashedPassword,
      otp,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };

    try {
      await sendOTPEmail(email, otp);
      res.render('verify_otp', { email, error: null }); // ✅ always pass error
    } catch (e) {
      console.error('Failed to send OTP email:', e);
      res.status(500).send('Failed to send OTP');
    }
  });
});

// POST: Verify OTP and create user
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore[email];

  if (!record) {
    return res.render('verify_otp', {
      email,
      error: 'No OTP found. Please register again.'
    });
  }

  const isExpired = Date.now() > record.expires;
  if (isExpired) {
    delete otpStore[email];
    return res.render('verify_otp', {
      email,
      error: 'OTP has expired. Please register again.'
    });
  }

  if (parseInt(otp) !== record.otp) {
    return res.render('verify_otp', {
      email,
      error: 'Invalid OTP. Please try again.'
    });
  }

  // OTP is valid — create user
  db.query(
    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
    [record.name, email, record.hashedPassword],
    (err, result) => {
      if (err) {
        console.error('DB Insert Error:', err);
        return res.status(500).send('Error saving user.');
      }

      delete otpStore[email];

      req.session.user = {
        id: result.insertId,
        name: record.name,
        email
      };

      res.redirect('/');
    }
  );
});

// POST: Resend OTP
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  const record = otpStore[email];

  if (!record) {
    return res.render('verify_otp', {
      email,
      error: 'No registration info found. Please register again.'
    });
  }

  const newOtp = Math.floor(100000 + Math.random() * 900000);
  otpStore[email] = {
    ...record,
    otp: newOtp,
    expires: Date.now() + 5 * 60 * 1000
  };

  try {
    await sendOTPEmail(email, newOtp);
    res.render('verify_otp', {
      email,
      error: 'A new OTP has been sent to your email.'
    });
  } catch (err) {
    console.error('Error sending email:', err);
    res.render('verify_otp', {
      email,
      error: 'Failed to resend OTP. Try again later.'
    });
  }
});

// Login Route
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).send('Database error');

    if (results.length === 0) {
      // Redirect with error=incorrect if user is not found
      return res.redirect('/login.html?error=incorrect');
    }

    const user = results[0];

    // Check if user is banned
    if (user.is_banned) {
      return res.redirect('/login.html?error=banned');
    }

    const match = await bcrypt.compare(password, user.password);

    if (match) {
      req.session.user = user;
      res.redirect('/');
    } else {
      // Redirect with error=incorrect if password doesn't match
      res.redirect('/login.html?error=incorrect');
    }
  });
});



// ✅ Logout Route — redirect to correct static HTML page
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Logout failed');
    }
    res.redirect('/login.html'); // ✅ fix here
  });
});

// POST: Forgot Password - send OTP
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).send('Database error');
    if (results.length === 0) {
      // Render forgot_password.html with error query param
      return res.redirect('/forgot_password.html?error=invalid');
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[email] = {
      otp,
      type: 'reset',
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };

    try {
      await sendOTPEmail(email, otp);
      // Redirect to forgot_password.html with step=verify & email so form toggles
      res.redirect(`/forgot_password.html?step=verify&email=${encodeURIComponent(email)}`);
    } catch (e) {
      console.error('Error sending OTP:', e);
      return res.status(500).send('Failed to send OTP');
    }
  });
});

// POST: Reset Password - verify OTP and update password
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const record = otpStore[email];

  if (!record || record.type !== 'reset') {
    return res.redirect(`/forgot_password.html?step=verify&email=${encodeURIComponent(email)}&error=invalid`);
  }

  if (Date.now() > record.expires) {
    delete otpStore[email];
    return res.redirect(`/forgot_password.html?step=verify&email=${encodeURIComponent(email)}&error=invalid`);
  }

  if (parseInt(otp) !== record.otp) {
    return res.redirect(`/forgot_password.html?step=verify&email=${encodeURIComponent(email)}&error=invalid`);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email], (err, result) => {
    if (err) {
      console.error('Error updating password:', err);
      return res.status(500).send('Database update failed');
    }

    delete otpStore[email];
    // Redirect to login page with success message param
    res.redirect('/login.html?reset=success');
  });
});

module.exports = router;
