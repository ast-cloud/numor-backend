const service = require('./chatBot.service');

exports.chat = async (req, res, next)=>{
    try{
        const user = req.user;
        const {message} = req.body;

        const reply = await service.handleChat(user, message);

        res.status(200).json({
            success: true,
            message: 'Chat processed successfully',
            data: reply,
        }); 
    } catch (error) {
        next(error);
    }
}