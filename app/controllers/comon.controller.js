const db = require("../models");
exports.callstore = async (req, res) => {
  try {
    const objstore = await db.sequelize.query(req.storename, {
      type: db.sequelize.QueryTypes.SELECT,
    });
    res.status(200).send(objstore);
    // console.log(objstore);
  }
  catch (err) {
    res.status(500).send({ error: err.message });
  }

}