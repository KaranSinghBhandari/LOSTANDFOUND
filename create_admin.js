const bcrypt = require('bcrypt');
const db = require('./db'); // Adjust if your db connection file is in another path

const email = 'karanbhandari512004@gmail.com';
const plainPassword = '123';
const name = 'Karan';

bcrypt.hash(plainPassword, 10, (err, hash) => {
  if (err) {
    console.error('Error hashing password:', err);
    return;
  }

  const sql = 'INSERT INTO admins (name, email, password) VALUES (?, ?, ?)';
  db.query(sql, [name, email, hash], (err, result) => {
    if (err) {
      console.error('Database insert error:', err);
    } else {
      console.log('✅ Admin user created successfully.');
    }

    // Exit the process once complete
    process.exit();
  });
});
