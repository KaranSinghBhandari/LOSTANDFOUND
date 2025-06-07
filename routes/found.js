const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db'); // ✅ Use shared DB here

// Multer storage config for found items
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename
  }
});
const upload = multer({ storage });

// POST route to handle found item submission
router.post('/submit-found', upload.single('image'), (req, res) => {
  const { user_name, email, item_name, date_found, location_found, description } = req.body;
  const image = req.file ? req.file.filename : null;

  // Format date for MySQL if needed
  const formattedDate = date_found.replace('T', ' '); // "YYYY-MM-DD HH:mm"

  const sql = `
    INSERT INTO found_items (user_name, email, item_name, date_found, location_found, description, image)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [user_name, email, item_name, formattedDate, location_found, description, image], (err, result) => {
    if (err) {
      console.error('Error inserting found item:', err);
      return res.status(500).send('Error saving found item.');
    }

    console.log('Found item reported successfully.');
    res.redirect('/');
  });
});

module.exports = router;
