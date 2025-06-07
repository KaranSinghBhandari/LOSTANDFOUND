const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');
const util = require('util');

// Promisify db.query for async/await
db.query = util.promisify(db.query);

// Claim handler
router.post('/:type/:itemId', async (req, res) => {
  const { type, itemId } = req.params;
  const userId = req.session.user.id;

  if (!['lost', 'found'].includes(type)) return res.status(400).send('Invalid item type');

  try {
    // // Check if user already claimed an item
    // const userClaims = await db.query('SELECT * FROM claims WHERE user_id = ? AND claim_status = "claimed"', [userId]);
    // if (userClaims.length > 0) {
    //   return res.send('<script>alert("You can only claim one item at a time."); window.history.back();</script>');
    // }

    const table = type === 'lost' ? 'lost_items' : 'found_items';
    const items = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [itemId]);
    if (items.length === 0) return res.status(404).send('Item not found');

    const item = items[0];

    if (item.status === 'Returned') {
      return res.send('<script>alert("This item has already been marked as Returned and cannot be claimed."); window.history.back();</script>');
    }

    // Check if item already claimed
    const itemClaims = await db.query('SELECT * FROM claims WHERE item_id = ? AND item_type = ? AND claim_status = "claimed"', [itemId, type]);
    if (itemClaims.length > 0) {
      return res.send('<script>alert("Item already claimed."); window.history.back();</script>');
    }

    // Insert claim record
    await db.query('INSERT INTO claims (item_id, user_id, item_type, claim_status) VALUES (?, ?, ?, "claimed")', [itemId, userId, type]);
    // Insert into claim_history 
    await db.query(`
    INSERT INTO claim_history (item_id, item_name, action, user_email)
    VALUES (?, ?, 'Claimed', ?)
    `, [item.id, item.item_name, req.session.user.email]);

    sendClaimNotification(userId, itemId, type);
    res.redirect('/?msg=claimed');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error claiming item');
  }
});

// Unclaim handler
router.post('/unclaim/:type/:itemId', async (req, res) => {
  const { type, itemId } = req.params;
  const userId = req.session.user.id;

  if (!['lost', 'found'].includes(type)) return res.status(400).send('Invalid item type');

  try {
    // Update claim status
    await db.query(
      'UPDATE claims SET claim_status = "unclaimed" WHERE item_id = ? AND user_id = ? AND item_type = ?',
      [itemId, userId, type]
    );
    // Get item name for claim_history
    const table = type === 'lost' ? 'lost_items' : 'found_items';
    const itemRows = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [itemId]);
    if (itemRows.length > 0) {
      const item = itemRows[0];
    // Insert into claim_history table
    await db.query(`
        INSERT INTO claim_history (item_id, item_name, action, user_email)
        VALUES (?, ?, 'Unclaimed', ?)
      `, [item.id, item.item_name, req.session.user.email]);
    }

    // Send notifications
    sendUnclaimNotification(userId, itemId, type);
    res.redirect('/?msg=unclaimed');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error unclaiming item');
  }
});

// Email Notification: Claim
function sendClaimNotification(userId, itemId, type) {
  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, users) => {
    if (err || users.length === 0) return;
    const user = users[0];

    const table = type === 'lost' ? 'lost_items' : 'found_items';
    db.query(`SELECT * FROM ${table} WHERE id = ?`, [itemId], (err, items) => {
      if (err || items.length === 0) return;

      const item = items[0];
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'campuslostandfoundmanagement@gmail.com',
          pass: 'uoqp keek czto ohqn'
        }
      });

      const mailOptionsStudent = {
        from: '"Campus Lost & Found Portal" <campuslostandfoundmanagement@gmail.com>',
        to: user.email,
        subject: `Item Claimed (${type})`,
        text: `You have successfully claimed the ${type} item: ${item.item_name}.`
      };

      const mailOptionsAdmin = {
        from: '"Campus Lost & Found Portal" <campuslostandfoundmanagement@gmail.com>',
        to: 'karanbhandari512004@gmail.com',
        subject: `Student Claimed an Item (${type})`,
        text: `Student ${user.name} (${user.email}) has claimed the ${type} item: ${item.item_name} (ID: ${item.id}).`
      };

      transporter.sendMail(mailOptionsStudent);
      transporter.sendMail(mailOptionsAdmin);
    });
  });
}

// Email Notification: Unclaim
function sendUnclaimNotification(userId, itemId, type) {
  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, users) => {
    if (err || users.length === 0) return;
    const user = users[0];

    const table = type === 'lost' ? 'lost_items' : 'found_items';
    db.query(`SELECT * FROM ${table} WHERE id = ?`, [itemId], (err, items) => {
      if (err || items.length === 0) return;

      const item = items[0];
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'campuslostandfoundmanagement@gmail.com',
          pass: 'uoqp keek czto ohqn'
        }
      });

      const mailOptionsStudent = {
        from: '"Campus Lost & Found Portal" <campuslostandfoundmanagement@gmail.com>',
        to: user.email,
        subject: `Item Unclaimed (${type})`,
        text: `You have unclaimed the ${type} item: ${item.item_name}.`
      };

      const mailOptionsAdmin = {
        from: '"Campus Lost & Found Portal" <campuslostandfoundmanagement@gmail.com>',
        to: 'karanbhandari512004@gmail.com',
        subject: `Student Unclaimed an Item (${type})`,
        text: `Student ${user.name} (${user.email}) has unclaimed the ${type} item: ${item.item_name} (ID: ${item.id}).`
      };

      transporter.sendMail(mailOptionsStudent);
      transporter.sendMail(mailOptionsAdmin);
    });
  });
}

module.exports = router;
