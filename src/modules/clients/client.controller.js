const clientService = require('./client.service');

exports.createClient = async function (req, res) {
    try{
        const user = req.user; // from auth middleware
        const data = req.body;

        const client = await clientService.createClient(user, data);

        res.status(201).json({success: true, data: client});
    }
    catch(err){
        res.status(400).json({success: false, message: err.message});
    }

}

exports.listClients = async function (req, res) {
    try{
        const user = req.user; //breakpoint here
        const clients = await clientService.listClient(user);

        console.log('Clients fetched:', clients);
        console.log('user:', user);

        res.json({success: true, data: clients});
    }
    catch(err){
        res.status(500).json({success: false, message: err.message});
    }

}

exports.getClient = async function (req, res) {
    try{
        const user = req.user; // from auth middleware
        const clientId = req.params.id; // from URL parameter

        const client = await clientService.getClientById(user, clientId);    
        res.json({success: true, data: client});
    }
    catch(err){
        res.status(500).json({success: false, message: err.message});
    }
}

exports.updateClient = async (req, res) => {
  try {
    const result = await clientService.updateClient({
      user: req.user,
      clientId: req.params.clientId,
      data: req.body,
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or not authorized',
      });
    }

    res.json({
      success: true,
      message: 'Client updated successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteClient = async (req, res) => {
  try {
    const result = await clientService.deleteClient({
      user: req.user,
      clientId: req.params.clientId
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or not authorized',
      });
    }

    res.json({
      success: true,
      message: 'Client deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};