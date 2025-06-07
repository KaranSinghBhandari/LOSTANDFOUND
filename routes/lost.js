const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// MySQL DB connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'lost_found_db'
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to MySQL database.');
});

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Route: Submit Lost Item
router.post('/submit-lost', upload.single('image'), (req, res) => {
  const { user_name, email, item_name, date_lost, location_lost, description } = req.body;
  const image = req.file ? req.file.filename : null;

  // Ensure datetime is formatted for MySQL
  const formattedDate = date_found.replace('T', ' '); // e.g., "2025-06-05 14:30"

  const sql = `
    INSERT INTO lost_items 
    (user_name, email, item_name, date_lost, location_lost, description, image) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [user_name, email, item_name, formattedDate, location_lost, description, image], (err, result) => {
    if (err) {
      console.error('Error inserting lost item:', err);
      return res.status(500).send('Error saving lost item.');
    }

    console.log('Lost item reported successfully.');
    res.redirect('/');
  });
});

// Route: Mark Lost Item as Found ("Received")
router.post('/mark-returned/:id', (req, res) => {
  const id = req.params.id;

  const fetchSql = 'SELECT email, item_name FROM lost_items WHERE id = ?';
  db.query(fetchSql, [id], (err, rows) => {
    if (err || rows.length === 0) {
      console.error('Error fetching item:', err);
      return res.status(500).send('Item not found.');
    }

    const { email, item_name } = rows[0];

  //  const updateSql = 'UPDATE lost_items SET status = "Received" WHERE id = ?';
  //  db.query(updateSql, [id], (err, result) => {
  //    if (err) return res.status(500).send('Error updating status.');

    // Insert into claim_history to log action
     const actorEmail = req.session?.user?.email || 'unknown@domain.com';
      const insertHistorySql = `
        INSERT INTO claim_history (item_id, item_name, action, user_email)
        VALUES (?, ?, 'Marked as Found', ?)
      `;
      db.query(insertHistorySql, [id, item_name, email], (historyErr) => {
        if (historyErr) {
          console.error('Error inserting into claim_history:', historyErr);
          // Optional: continue or return error
        } else {
          console.log('Claim history logged for item id:', id);
        }

      // Send email notification to item owner
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'campuslostandfoundmanagement@gmail.com',
          pass: process.env.EMAIL_PASS || 'uoqp keek czto ohqn'
        }
      });

      const mailOptionsToOwner = {
        from: `"Campus Lost & Found Portal" <${process.env.EMAIL_USER || 'campuslostandfoundmanagement@gmail.com'}>`,
        to: email,
        subject: 'Good News! Your lost item was found!',
        text: `Someone found your lost item: "${item_name}". Please visit the Lost & Found portal for details.`
      };

      // Email to the admin
      const mailOptionsToAdmin = {
        from: `"Campus Lost & Found Portal" <${process.env.EMAIL_USER || 'campuslostandfoundmanagement@gmail.com'}>`,
        to: 'karanbhandari512004@gmail.com', // Change to your admin's email
        subject: 'Lost Item Found - Admin Notification',
        text: `An item has been marked as found: "${item_name}". Please check the Lost & Found portal for details.`
      };

      transporter.verify((error, success) => {
        if (error) {
          console.error('❌ Error verifying transporter config:', error);
        } else {
          console.log('✅ Server is ready to send emails');
        }
      });

      // Send email to owner
      transporter.sendMail(mailOptionsToOwner, (err, info) => {
        if (err) {
          console.error('Email sending failed to owner:', err);
        } else {
          console.log('✅ Email sent successfully to owner:', email);
        }
      });

      // Send email to admin
      transporter.sendMail(mailOptionsToAdmin, (err, info) => {
        if (err) {
          console.error('Email sending failed to admin:', err);
        } else {
          console.log('✅ Email sent successfully to admin');
        }
      });

      res.redirect('/?msg=markedReturned');
    });
  });
});

module.exports = router;
