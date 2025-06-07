const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const sendOTPEmail = require('../utils/mailer');
const db = require('../db');
const crypto = require('crypto');
const path = require('path');

// In-memory store for OTPs (temporary storage)
const otpAdminStore = {};  // Store OTPs for admin registration
const resetTokens = {};    // for forgot password OTP
const { parse } = require('json2csv');

// Middleware: Check if admin is logged in
function isAdminLoggedIn(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  res.redirect('/admin_login.html');
}

// GET: Admin login page
router.get('/login', (req, res) => {
  res.render('admin_login.html');
});

// POST: Handle admin login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const sql = 'SELECT * FROM admins WHERE email = ?';
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).send('Database error');
    if (results.length === 0) {
      return res.redirect('/admin_login.html?error=incorrect');
    }

    const admin = results[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.redirect('/admin_login.html?error=incorrect');
    }

    // Save admin to session
    req.session.admin = {
      id: admin.id,
      name: admin.name,
      email: admin.email
    };

    res.redirect('/admin/dashboard');
  });
});

// GET: Admin dashboard (protected)
router.get('/dashboard', isAdminLoggedIn, (req, res) => {
  res.render('admin_dashboard', { admin: req.session.admin });
});

// GET: Admin logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Logout failed');
    }
    res.redirect('/admin_login.html');
  });
});

// GET: Register new admin form (protected)
router.get('/register', isAdminLoggedIn, (req, res) => {
  res.render('admin_register');
});

/// POST: Register new admin — generates OTP & sends email
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  db.query('SELECT * FROM admins WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).send('Database error.');
    if (results.length > 0) {
      return res.send('<script>alert("Admin with this email already exists."); window.history.back();</script>');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    otpAdminStore[email] = {
      name,
      hashedPassword,
      otp,
      expires: Date.now() + 5 * 60 * 1000
    };

    try {
      await sendOTPEmail(email, otp);
      res.render('verify_admin_otp', { email, error: null }); // ✅ FIXED: error passed
    } catch (e) {
      console.error('Failed to send OTP email:', e);
      res.status(500).send('Failed to send OTP.');
    }
  });
});

// POST: Verify OTP and create admin
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const record = otpAdminStore[email]; // ✅ FIXED: correct store used

  if (!record) {
    return res.send('No OTP found. Please register again.');
  }

  const isExpired = Date.now() > record.expires;
  if (isExpired) {
    delete otpAdminStore[email];
    return res.send('OTP has expired. Please register again.');
  }

  if (parseInt(otp) !== record.otp) {
    return res.render('verify_admin_otp', { email, error: 'Invalid OTP. Please try again.' }); // ✅ better UX
  }

  db.query(
    'INSERT INTO admins (name, email, password) VALUES (?, ?, ?)',
    [record.name, email, record.hashedPassword],
    (err, result) => {
      if (err) {
        console.error('DB Insert Error:', err);
        return res.status(500).send('Error saving admin.');
      }

      delete otpAdminStore[email]; // ✅ correct store cleared

      req.session.admin = {
        id: result.insertId,
        name: record.name,
        email
      };

      res.redirect('/admin/dashboard');
    }
  );
});

// POST: Resend OTP
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  const record = otpAdminStore[email]; // ✅ FIXED

  if (!record) {
    return res.render('verify_admin_otp', { email, error: 'No registration info found. Please register again.' });
  }

  const newOtp = Math.floor(100000 + Math.random() * 900000);
  otpAdminStore[email] = {
    ...record,
    otp: newOtp,
    expires: Date.now() + 5 * 60 * 1000
  };

  try {
    await sendOTPEmail(email, newOtp);
    res.render('verify_admin_otp', { email, error: 'A new OTP has been sent to your email.' });
  } catch (err) {
    console.error('Error sending email:', err);
    res.render('verify_admin_otp', { email, error: 'Failed to resend OTP. Try again later.' });
  }
});

// View and manage found items
router.get('/found-items', isAdminLoggedIn, (req, res) => {
  const query = 'SELECT * FROM found_items ORDER BY date_found DESC';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching found items:', err);
      return res.status(500).send('Server error');
    }

    res.render('admin_found_items', {
      admin: req.session.admin,
      foundItems: results
    });
  });
});

// Toggle found item returned status
router.post('/found-items/toggle-returned/:id', isAdminLoggedIn, (req, res) => {
  const itemId = req.params.id;

  const selectQuery = 'SELECT status FROM found_items WHERE id = ?';
  db.query(selectQuery, [itemId], (selectErr, results) => {
    if (selectErr) {
      console.error('Error fetching item status:', selectErr);
      return res.status(500).send('Internal Server Error');
    }

    if (results.length === 0) {
      return res.status(404).send('Item not found');
    }

    const currentStatus = results[0].status;
    const newStatus = currentStatus === 'Returned' ? 'Found' : 'Returned';

    const updateQuery = 'UPDATE found_items SET status = ? WHERE id = ?';
    db.query(updateQuery, [newStatus, itemId], (updateErr) => {
      if (updateErr) {
        console.error('Error updating item status:', updateErr);
        return res.status(500).send('Error updating item status');
      }

      res.redirect('/admin/found-items');
    });
  });
});

// Delete found item
router.post('/found-items/delete/:id', isAdminLoggedIn, (req, res) => {
  const itemId = req.params.id;
  const query = 'DELETE FROM found_items WHERE id = ?';

  db.query(query, [itemId], (err) => {
    if (err) {
      console.error('Error deleting item:', err);
      return res.status(500).send('Error deleting item');
    }
    res.redirect('/admin/found-items');
  });
});

// Get all lost items (protected)
router.get('/lost-items', isAdminLoggedIn, (req, res) => {
  db.query('SELECT * FROM lost_items ORDER BY date_lost DESC', (err, results) => {
    if (err) {
      console.error('Error fetching lost items:', err);
      return res.status(500).send('Database error');
    }
    res.render('admin_lost_items', {
      admin: req.session.admin,
      lostItems: results
    });
  });
});

// Toggle returned status for lost items
router.post('/lost-items/toggle-returned/:id', isAdminLoggedIn, (req, res) => {
  const itemId = req.params.id;

  // Fetch current status
  const query = 'SELECT status FROM lost_items WHERE id = ?';
  db.query(query, [itemId], (err, results) => {
    if (err || results.length === 0) {
      console.error('Error fetching item status:', err || 'Item not found');
      return res.status(500).send('Error toggling status');
    }

    const currentStatus = results[0].status;

    // Toggle logic: If currently Returned, switch to Received; else switch to Returned
    const newStatus = currentStatus === 'Received' ? 'Pending' : 'Received';

    // Update status
    const updateQuery = 'UPDATE lost_items SET status = ? WHERE id = ?';
    db.query(updateQuery, [newStatus, itemId], (updateErr) => {
      if (updateErr) {
        console.error('Error updating status:', updateErr);
        return res.status(500).send('Update failed');
      }
      res.redirect('/admin/lost-items'); // Make sure this matches your route/view
    });
  });
});

// Delete lost item (protected)
router.post('/lost-items/delete/:id', isAdminLoggedIn, (req, res) => {
  const itemId = req.params.id;
  db.query('DELETE FROM lost_items WHERE id = ?', [itemId], (err) => {
    if (err) {
      console.error('Error deleting item:', err);
      return res.status(500).send('Failed to delete item');
    }
    res.redirect('/admin/lost-items');
  });
});

// View claim/unclaim/marked as found history
router.get('/history', (req, res) => {
  const sql = `
    SELECT 
      id, 
      item_name AS itemName, 
      action, 
      user_email AS user, 
      action_date AS date 
    FROM claim_history 
    ORDER BY action_date DESC
    LIMIT 25
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).send('Database error');
    }

    // Optional: format date to readable string if needed
    const history = results.map(record => ({
      ...record,
      // action_date: new Date(record.action_date).toLocaleString()
      date: new Date(record.date).toLocaleString()
    }));

    res.render('admin_history', { history });
  });
});


// View all registered users
router.get('/manage-users', (req, res) => {
  const sql = 'SELECT id, name, email, is_banned FROM users ORDER BY id DESC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).send('Database error');
    }
    // Convert is_banned to boolean for safety (in case DB returns 0/1 as number or string)
    const users = results.map(user => ({
      ...user,
      is_banned: user.is_banned == 1
    }));
    res.render('manage_users', { users });
  });
});

// Ban a user
router.post('/ban-user/:id', (req, res) => {
  const userId = req.params.id;
  const sql = 'UPDATE users SET is_banned = 1 WHERE id = ?';
  db.query(sql, [userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to ban user');
    }
    res.redirect('/admin/manage-users');
  });
});

// Unban a user
router.post('/unban-user/:id', (req, res) => {
  const userId = req.params.id;
  const sql = 'UPDATE users SET is_banned = 0 WHERE id = ?';
  db.query(sql, [userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to unban user');
    }
    res.redirect('/admin/manage-users');
  });
});

// ------------------ FORGOT PASSWORD FEATURE ------------------

// GET: Forgot Password Page
router.get('/forgot-password', (req, res) => {
  const filePath = path.join(__dirname, '../public/admin_forgot_password.html'); // Adjust path accordingly
  res.sendFile(filePath);
});

// POST: Submit email to send OTP
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  db.query('SELECT * FROM admins WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('Server error');
    }

    if (results.length === 0) {
      // Regardless, redirect as if OTP sent to prevent enumeration
      return res.redirect(`/admin/forgot-password?step=verify&email=${encodeURIComponent(email)}`);
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expires = Date.now() + 5 * 60 * 1000;

    resetTokens[email] = { otp, expires };

    try {
      await sendOTPEmail(email, otp);
      return res.redirect(`/admin/forgot-password?step=verify&email=${encodeURIComponent(email)}`);
    } catch (e) {
      console.error('Error sending OTP:', e);
      return res.status(500).send('Failed to send OTP email.');
    }
  });
});

// POST: Verify OTP and reset password
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const record = resetTokens[email];
  if (!record) {
    return res.redirect(`/admin/forgot-password?step=verify&email=${encodeURIComponent(email)}&error=invalid`);
  }

  if (Date.now() > record.expires) {
    delete resetTokens[email];
    return res.redirect(`/admin/forgot-password?error=expired`);
  }

  if (parseInt(otp) !== record.otp) {
    return res.redirect(`/admin/forgot-password?step=verify&email=${encodeURIComponent(email)}&error=invalid`);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  db.query('UPDATE admins SET password = ? WHERE email = ?', [hashedPassword, email], (err) => {
    if (err) {
      console.error('Error updating password:', err);
      return res.status(500).send('Failed to update password.');
    }

    delete resetTokens[email];
    return res.redirect('/admin_login.html?reset=success');
  });
});

router.get('/analytics', (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM lost_items) AS totalLost,
      (SELECT COUNT(*) FROM found_items) AS totalFound,
      (SELECT COUNT(*) FROM claims WHERE claim_status = 'claimed') AS totalClaimed,
      (SELECT COUNT(*) FROM claims WHERE claim_status = 'unclaimed') AS totalUnclaimed,
      (SELECT COUNT(*) FROM lost_items WHERE status = 'Received') + (SELECT COUNT(*) FROM found_items WHERE status = 'Returned') AS totalReturned
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching dashboard stats:', err);
      return res.status(500).send('Internal Server Error');
    }

    const row = results[0];
    res.render('admin_analytics', {
      stats: {
        totalLost: row.totalLost,
        totalFound: row.totalFound,
        totalClaimed: row.totalClaimed,
        totalUnclaimed: row.totalUnclaimed,
        totalReturned: row.totalReturned
      }
    });
  });
});

module.exports = router;
