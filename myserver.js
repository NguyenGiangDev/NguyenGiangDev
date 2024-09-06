const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware đọc dữ liệu form và cookie
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Kết nối tới MongoDB
mongoose.connect('mongodb://localhost:27017/userDB')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Tạo schema và model người dùng
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});

const User = mongoose.model('User', userSchema);

// Cấu hình đường dẫn tĩnh cho các file trong thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// 1. Route trả về trang Đăng Ký (DangKy.html)
app.get('/dang-ky', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'DangKy.html'));
});

// 2. Xử lý đăng ký (POST request tới /dang-ky)
app.post('/dang-ky', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).send('Mật khẩu không khớp');
  }

  // Mã hóa mật khẩu
  const hashedPassword = await bcrypt.hash(password, 10);

  // Lưu người dùng vào MongoDB
  const newUser = new User({
    username: username,
    email: email,
    password: hashedPassword,
  });

  await newUser.save();
  res.redirect('/dang-nhap');
});

// 3. Route trả về trang Đăng Nhập (DangNhap.html)
app.get('/dang-nhap', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'DangNhap.html'));
});

// 4. Xử lý đăng nhập (POST request tới /dang-nhap)
app.post('/dang-nhap', async (req, res) => {
  const { username, password } = req.body;

  // Tìm người dùng theo username
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(400).send('Không tìm thấy người dùng');
  }

  // Kiểm tra mật khẩu
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).send('Mật khẩu không đúng');
  }

  // Tạo token JWT
  const token = jwt.sign({ id: user._id, email: user.email }, 'secret_key', { expiresIn: '1h' });

  // Lưu token vào cookie
  res.cookie('token', token, { httpOnly: true });

  // Điều hướng đến trang chủ
  res.sendFile(path.join(__dirname, 'public', 'TrangChu.html'));
});

// 5. Route trả về trang chủ (TrangChu.html) sau khi đăng nhập
app.get('/trangchu', (req, res) => {
  const token = req.cookies.token;

  // Kiểm tra token
  if (!token) {
    return res.status(401).send('Bạn cần đăng nhập để truy cập trang này.');
  }

  // Giải mã token
  jwt.verify(token, 'secret_key', (err, decoded) => {
    if (err) {
      return res.status(401).send('Token không hợp lệ.');
    }

    // Token hợp lệ, trả về trang chủ
    res.sendFile(path.join(__dirname, 'public', 'TrangChu.html'));
  });
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
