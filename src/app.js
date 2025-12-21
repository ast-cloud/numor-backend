// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('../src/routes/index');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

app.use('/api', routes); 

BigInt.prototype.toJSON = function () {
    return this.toString();
};

app.use(errorMiddleware);

module.exports = app;
