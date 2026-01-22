const db = require("../models");
exports.callstore = async (req, res) => {
  try {
    const storename = req.query.storename;
    if (!storename) {
      return res.status(400).send({ error: "storename parameter is required" });
    }

    // Format as stored procedure call if it looks like a function name
    let query = storename;
    if (storename.match(/^[a-zA-Z_][a-zA-Z0-9_]*\(\)$/)) {
      // If it's like "GetCustomersList()", format as CALL for MySQL
      query = `CALL ${storename}`;
    }

    const objstore = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
      raw: true,
    });
    res.status(200).send(objstore);
    // console.log(objstore);
  }
  catch (err) {
    console.error('Query error:', err);
    res.status(500).send({ error: err.message });
  }

}