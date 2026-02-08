const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExt = [
      '.pdf',
      '.png',
      '.jpg',
      '.jpeg',
      '.xls',
      '.xlsx',
      '.csv'
    ];

    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      allowedExt.includes(ext) &&
      allowedMimeTypes.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Only PDF, Image (PNG/JPG), and Excel (XLS/XLSX) and CSV files are allowed'
        )
      );
    }
  }
});
module.exports = upload;
