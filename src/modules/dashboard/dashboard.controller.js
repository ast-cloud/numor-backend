const kpi = require('../dashboard/dashboard.service');

exports.userRevenue = async (req, res)=>{
    const user = req.user;
    const {startDate, endDate} = req.query;

    const data = await kpi.revenueByCustomer(user.userId, startDate, endDate);
    console.log('Customer revenue data:', data);
    res.json({success: true, data});
}

exports.userExpense = async (req, res)=>{
    const user = req.user;
    const {startDate, endDate} = req.query;

    const data = await kpi.expenseByUser(user.userId, startDate, endDate);
    res.json({success: true, data});
}

exports.dashboardSummary = async (req, res) => {
    const user = req.user;
    const {startDate, endDate} = req.query;

    const data = await kpi.dashboardSummary(user.userId, startDate, endDate);
    res.json({success: true, data});
}

exports.revenueExpenseTrend = async (req, res) => {
    const user = req.user;
    const {startDate, endDate} = req.query;

    const data = await kpi.revenueExpenseTrend(user.userId, startDate, endDate);
    res.json({success: true, data});
}