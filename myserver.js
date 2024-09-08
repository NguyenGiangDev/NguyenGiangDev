const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const app = express();
const PORT = 3000;

const saveDirectory = path.join(__dirname, 'saved_decks');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// 6. Xử lý đăng xuất (POST request tới /logout)
app.post('/logout', (req, res) => {
  // Xóa cookie chứa token
  res.clearCookie('token');

  // Chuyển hướng người dùng về trang đăng nhập hoặc trang chính
  res.redirect('/dang-nhap');
});

// 7. Route lấy thông tin các lá bài
app.get('/api/cards', async (req, res) => {
  try {
    const response = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    const allCards = response.data.data;
    
    // Lấy 50 lá bài đầu tiên
    const partCard = allCards.slice(0, 5000);

    // Gửi 50 lá bài về client
    res.json(partCard);
  } catch (error) {
    console.error('Error fetching card data:', error);
    res.status(500).send('Lỗi khi lấy dữ liệu các lá bài');
  }
});

// 8. Xử lý tìm kiếm lá bài (POST request tới /search)
app.post('/search', async (req, res) => {
  const { searchcard } = req.body;
  
  try {
    if (!searchcard || typeof searchcard !== 'string') {
      return res.status(400).send('Từ khóa tìm kiếm không hợp lệ');
    }

    const response = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    const allCards = response.data.data;

    const matchedCards = allCards.filter(card => {
      if (card.name && typeof card.name === 'string') {
        return card.name.toLowerCase().includes(searchcard.toLowerCase());
      }
      return false;
    });

    if (matchedCards.length > 0) {
      res.json(matchedCards);
    } else {
      res.status(404).send('Không tìm thấy lá bài nào phù hợp.');
    }
  } catch (error) {
    console.error('Error searching cards:', error);
    res.status(500).send('Lỗi khi tìm kiếm lá bài.');
  }
});

// 9. Điều hướng đến trang tạo deck
app.get('/tao-deck', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'CreateDeck.html')); // Điều hướng đến file HTML của trang tạo deck
});

// 10. Xử lý Tạo deck (POST request tới /createdeck)
app.post('/createdeck', (req, res) => {
  // Xóa cookie chứa token
  res.redirect('/tao-deck');
});

// 11. Lưu deck
app.post('/downdeck', (req, res) => {
  const deckData = req.body;
  
  // Đảm bảo thư mục tồn tại
  if (!fs.existsSync(saveDirectory)) {
    fs.mkdirSync(saveDirectory, { recursive: true });
  }

  const fileName = 'deck.json';
  const filePath = path.join(saveDirectory, fileName);

  fs.writeFile(filePath, JSON.stringify(deckData, null, 2), (err) => {
    if (err) {
      console.error('Lỗi khi ghi file:', err);
      return res.status(500).send('Đã xảy ra lỗi khi lưu deck.');
    }

    res.status(200).json({ fileUrl: `/saved_decks/${fileName}` });
  });
});

app.use('/saved_decks', express.static(path.join(__dirname, 'saved_decks')));
//12. Điều hướng đến trang hiện thị deck
app.get('/yourdeck', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Load_deck.html'));
});

app.post('/your-deck', (req, res)=> {
  res.redirect('/yourdeck');
});
// Khởi động server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
