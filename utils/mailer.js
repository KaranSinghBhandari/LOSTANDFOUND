const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'campuslostandfoundmanagement@gmail.com',
    pass: 'uoqp keek czto ohqn'
  }
});

async function sendOTPEmail(to, otp) {
  const mailOptions = {
    from: '"Campus Lost & Found Portal" <campuslostandfoundmanagement@gmail.com>',
    to,
    subject: 'Your OTP for Lost & Found Portal',
    html: `<p>Your OTP is <strong>${otp}</strong>. It is valid for a few minutes.</p>`
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendOTPEmail;
