const db = require("../models");

function notImplemented(handlerName, req, res) {
    res.status(501).json({
        error: `${handlerName} is not implemented yet`
    });
}

exports.listservice = async (req, res) => {
    try {
        const { categorykey } = req.query;

        const conditions = ["dateinactivated IS NULL"];
        const replacements = {};

        if (categorykey) {
            conditions.push("categorykey = :categorykey");
            replacements.categorykey = categorykey;
        }

        const services = await db.sequelize.query(
            `SELECT pkey, name, price, pricevip, needproduct, price_promotion,
              categorykey, com1a, com1b, com2a, com2b
       FROM tblpos_service
       WHERE 1
       `,
            {
                replacements,
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        res.status(200).json(services);
    } catch (err) {
        console.error("Error fetching services:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.createsale = async (req, res) => {
    try {
        const {
            servicekey,
            payment_method,
            customer_key,
            order_key
        } = req.body;

        if (!Array.isArray(servicekey) || servicekey.length === 0) {
            return res.status(400).json({ error: "servicekey must be a non-empty array" });
        }

        const normalizedServiceKeys = servicekey.map((key) => Number(key));
        const hasInvalidServiceKey = normalizedServiceKeys.some(
            (key) => !Number.isInteger(key) || key <= 0
        );

        if (hasInvalidServiceKey) {
            return res.status(400).json({ error: "servicekey array contains invalid values" });
        }

        const uniqueServiceKeys = [...new Set(normalizedServiceKeys)];
        const serviceKeyPlaceholders = uniqueServiceKeys.map((_, idx) => `:servicekey${idx}`);
        const serviceKeyReplacements = uniqueServiceKeys.reduce((acc, key, idx) => {
            acc[`servicekey${idx}`] = key;
            return acc;
        }, {});

        const serviceRows = await db.sequelize.query(
            `SELECT pkey, name, price
             FROM tblpos_service
             WHERE dateinactivated IS NULL
               AND pkey IN (${serviceKeyPlaceholders.join(",")})`,
            {
                replacements: serviceKeyReplacements,
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        if (!serviceRows.length) {
            return res.status(400).json({ error: "No valid services found" });
        }

        const serviceMap = new Map(serviceRows.map((row) => [Number(row.pkey), row]));
        const missingServiceKeys = uniqueServiceKeys.filter((key) => !serviceMap.has(key));

        if (missingServiceKeys.length > 0) {
            return res.status(400).json({
                error: "Some services were not found",
                servicekey: missingServiceKeys
            });
        }

        const saleItems = normalizedServiceKeys.map((key) => {
            const service = serviceMap.get(key);
            return {
                servicekey: key,
                servicename: String(service.name || "").trim(),
                price: Number(service.price) || 0
            };
        });

        const total = saleItems.reduce((sum, item) => sum + item.price, 0);
        const normalizedPaymentMethod = payment_method ? String(payment_method).trim() : null;
        const normalizedCustomerKey =
            customer_key === undefined || customer_key === null || customer_key === ""
                ? null
                : Number(customer_key);
        const normalizedOrderKey = order_key ? String(order_key).trim() : null;

        if (
            normalizedCustomerKey !== null &&
            (!Number.isInteger(normalizedCustomerKey) || normalizedCustomerKey <= 0)
        ) {
            return res.status(400).json({ error: "customer_key must be a positive integer" });
        }

        const transaction = await db.sequelize.transaction();

        try {
            const saleResult = await db.sequelize.query(
                `INSERT INTO tblpos_sale
                 (total, payment_method, dateactivated)
                 VALUES (:total, :payment_method, NOW())`,
                {
                    replacements: {
                        total,
                        payment_method: normalizedPaymentMethod,
                    },
                    type: db.sequelize.QueryTypes.INSERT,
                    transaction
                }
            );

            const saleKey = saleResult[0];

            for (let i = 0; i < saleItems.length; i += 1) {
                const item = saleItems[i];

                await db.sequelize.query(
                    `INSERT INTO tblpos_sale_service
                     (sale_key, servicename, servicekey, price, payment_method, dateactivated)
                     VALUES
                     (:sale_key, :servicename, :servicekey, :price, :payment_method, NOW())`,
                    {
                        replacements: {
                            sale_key: saleKey,
                            servicename: item.servicename,
                            servicekey: item.servicekey,
                            price: item.price,
                            payment_method: normalizedPaymentMethod,
                        },
                        type: db.sequelize.QueryTypes.INSERT,
                        transaction
                    }
                );
            }

            await transaction.commit();

            return res.status(201).json({
                message: "Sale created successfully",
                pkey: saleKey,
                total,
                items_count: saleItems.length
            });
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

    } catch (err) {
        console.error("Error creating sale:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.listsales = async (req, res) => {
    return notImplemented("listsales", req, res);
};

exports.getsale = async (req, res) => {
    return notImplemented("getsale", req, res);
};

exports.completesale = async (req, res) => {
    return notImplemented("completesale", req, res);
};

exports.voidsale = async (req, res) => {
    return notImplemented("voidsale", req, res);
};

exports.addsaleitem = async (req, res) => {
    return notImplemented("addsaleitem", req, res);
};

exports.removesaleitem = async (req, res) => {
    return notImplemented("removesaleitem", req, res);
};

exports.dailysummary = async (req, res) => {
    return notImplemented("dailysummary", req, res);
};
