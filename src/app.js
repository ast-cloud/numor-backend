// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('../src/routes/index');
const errorMiddleware = require('./middlewares/error.middleware');
// const cookieParser = require("cookie-parser");

const app = express();
app.use(helmet());
// app.use(cookieParser());
app.use((req, res, next) => {
  console.log('Request URL:', req.originalUrl);
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});
app.use(express.json());
allowedOrigins = [
    'https://numor.app',
    'https://www.numor.app',
    'http://localhost:3000',
    'https://id-preview--15482be5-6c09-4a46-b5df-d1f1337d4fbb.lovable.app',
    'https://preview--numor.lovable.app',
    'https://15482be5-6c09-4a46-b5df-d1f1337d4fbb.lovableproject.com',
];
app.use(cors(
    {
        origin: function (origin, callback) {
            console.log('CORS origin:', origin);
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },  
        credentials: true,  
    }
));
app.use(helmet());
app.use(morgan('dev'));

app.use('/api', routes); 

BigInt.prototype.toJSON = function () {
    return this.toString();
};
console.log('✅ app.js loaded');
app.use(errorMiddleware);

module.exports = app;
