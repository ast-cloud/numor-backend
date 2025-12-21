const Tesseract = require('tesseract.js');

async function extractText(filePath){
    const result = await Tesseract.recognize(
        filePath,
        'eng',
        { logger: m => console.log(m) }
    );
    return result.data.text;    
}

module.exports = {
    extractText,
};