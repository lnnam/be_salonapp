const crypto = require("crypto");

const db = require("../models");

function formatDateYmd(inputDate) {
    const year = inputDate.getFullYear();
    const month = String(inputDate.getMonth() + 1).padStart(2, "0");
    const day = String(inputDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseYmdToDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function getWeekStartYmd(dateValue) {
    const localDate = new Date(dateValue);
    const day = localDate.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    localDate.setDate(localDate.getDate() + diff);
    return formatDateYmd(localDate);
}

function toMoney(value) {
    const numeric = Number(value) || 0;
    return Number(numeric.toFixed(2));
}

function generateRandomSalePkey(length = 5) {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(length);
    let key = "";

    for (let index = 0; index < length; index += 1) {
        key += characters[bytes[index] % characters.length];
    }

    return key;
}

async function generateUniqueSalePkey(transaction) {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const pkey = generateRandomSalePkey();
        const existingSale = await db.sequelize.query(
            `SELECT pkey
             FROM tblpos_sale
             WHERE pkey = :pkey
             LIMIT 1`,
            {
                replacements: { pkey },
                type: db.sequelize.QueryTypes.SELECT,
                transaction
            }
        );

        if (!existingSale.length) {
            return pkey;
        }
    }

    throw new Error("Unable to generate unique sale key");
}

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
            dateactivated
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

        if (
            normalizedCustomerKey !== null &&
            (!Number.isInteger(normalizedCustomerKey) || normalizedCustomerKey <= 0)
        ) {
            return res.status(400).json({ error: "customer_key must be a positive integer" });
        }

        const finalDateActivated = dateactivated ? String(dateactivated).trim() : null;
        if (!finalDateActivated) {
            return res.status(400).json({ error: "dateactivated is required" });
        }

        const transaction = await db.sequelize.transaction();

        try {
            const saleKey = await generateUniqueSalePkey(transaction);

            await db.sequelize.query(
                `INSERT INTO tblpos_sale
                 (pkey, total, payment_method, customer_key, dateactivated)
                 VALUES (:pkey, :total, :payment_method, :customer_key, :dateactivated)`,
                {
                    replacements: {
                        pkey: saleKey,
                        total,
                        payment_method: normalizedPaymentMethod,
                        customer_key: normalizedCustomerKey,
                        dateactivated: finalDateActivated,
                    },
                    type: db.sequelize.QueryTypes.INSERT,
                    transaction
                }
            );

            for (let i = 0; i < saleItems.length; i += 1) {
                const item = saleItems[i];

                await db.sequelize.query(
                    `INSERT INTO tblpos_sale_service
                     (sale_key, servicename, servicekey, price, payment_method, dateactivated)
                     VALUES
                     (:sale_key, :servicename, :servicekey, :price, :payment_method, :dateactivated)`,
                    {
                        replacements: {
                            sale_key: saleKey,
                            servicename: item.servicename,
                            servicekey: item.servicekey,
                            price: item.price,
                            payment_method: normalizedPaymentMethod,
                            dateactivated: finalDateActivated,
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
    try {
        const inputDate = req.query.date ? String(req.query.date).trim() : "";
        const now = new Date();
        const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
            now.getDate()
        ).padStart(2, "0")}`;
        const reportDate = inputDate || defaultDate;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
            return res.status(400).json({
                error: "Invalid date format. Expected YYYY-MM-DD"
            });
        }

        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const salesRows = await db.sequelize.query(
            `SELECT
                s.pkey,
                COALESCE(s.total, 0) AS total,
                COALESCE(NULLIF(TRIM(s.payment_method), ''), 'unknown') AS payment_method,
                s.dateactivated
             FROM tblpos_sale s
                         WHERE DATE(s.dateactivated) = :reportDate
                             AND s.dateinactivated IS NULL
             ORDER BY s.dateactivated DESC, s.pkey DESC
             LIMIT :limit OFFSET :offset`,
            {
                replacements: {
                    reportDate,
                    limit,
                    offset
                },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        const saleKeys = salesRows
            .map((row) => String(row.pkey || "").trim())
            .filter(Boolean);
        const servicesBySaleKey = {};

        if (saleKeys.length > 0) {
            const saleKeyPlaceholders = saleKeys.map((_, idx) => `:salekey${idx}`);
            const saleKeyReplacements = saleKeys.reduce((acc, key, idx) => {
                acc[`salekey${idx}`] = key;
                return acc;
            }, {});

            const serviceRows = await db.sequelize.query(
                `SELECT
                    sale_key,
                    TRIM(COALESCE(servicename, '')) AS servicename,
                    COALESCE(price, 0) AS price
                 FROM tblpos_sale_service
                 WHERE sale_key IN (${saleKeyPlaceholders.join(",")})
                 ORDER BY sale_key DESC, pkey ASC`,
                {
                    replacements: saleKeyReplacements,
                    type: db.sequelize.QueryTypes.SELECT
                }
            );

            serviceRows.forEach((row) => {
                const saleKey = String(row.sale_key || "").trim();
                if (!servicesBySaleKey[saleKey]) {
                    servicesBySaleKey[saleKey] = [];
                }

                servicesBySaleKey[saleKey].push({
                    name: row.servicename || "Service",
                    price: Number(Number(row.price || 0).toFixed(2))
                });
            });
        }

        const countRows = await db.sequelize.query(
            `SELECT COUNT(*) AS total_count
             FROM tblpos_sale s
             WHERE DATE(s.dateactivated) = :reportDate
               AND s.dateinactivated IS NULL`,
            {
                replacements: { reportDate },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        const totalCount = Number(countRows[0] && countRows[0].total_count) || 0;
        const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;

        const receipts = salesRows.map((row) => {
            const saleKey = String(row.pkey || "").trim();
            const services = servicesBySaleKey[saleKey] || [];

            return {
                pkey: saleKey,
                receipt_no: `#${row.pkey}`,
                services,
                payment_method: String(row.payment_method || "unknown").toUpperCase(),
                total: Number(Number(row.total || 0).toFixed(2)),
                dateactivated: row.dateactivated
            };
        });

        return res.status(200).json({
            date: reportDate,
            pagination: {
                page,
                limit,
                total: totalCount,
                total_pages: totalPages
            },
            receipts
        });
    } catch (err) {
        console.error("Error fetching receipt list:", err);
        return res.status(500).json({ error: err.message });
    }
};

exports.getsale = async (req, res) => {
    return notImplemented("getsale", req, res);
};

exports.completesale = async (req, res) => {
    return notImplemented("completesale", req, res);
};

exports.voidsale = async (req, res) => {
    try {
        const saleKey = String(req.params.pkey || "").trim();

        if (!saleKey) {
            return res.status(400).json({ error: "pkey is required" });
        }

        const transaction = await db.sequelize.transaction();

        try {
            await db.sequelize.query(
                `DELETE FROM tblpos_sale_service
                 WHERE sale_key = :sale_key`,
                {
                    replacements: { sale_key: saleKey },
                    type: db.sequelize.QueryTypes.DELETE,
                    transaction
                }
            );

            const saleDeleteResult = await db.sequelize.query(
                `DELETE FROM tblpos_sale
                 WHERE pkey = :pkey`,
                {
                    replacements: { pkey: saleKey },
                    type: db.sequelize.QueryTypes.DELETE,
                    transaction
                }
            );

            const rawResult = Array.isArray(saleDeleteResult) ? saleDeleteResult[1] : saleDeleteResult;
            const affectedRows = (rawResult && typeof rawResult === "object")
                ? (rawResult.affectedRows ?? 0)
                : (Number(rawResult) || 0);



            await transaction.commit();
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

        return res.status(200).json({
            message: "Sale deleted successfully",
            pkey: saleKey
        });
    } catch (err) {
        console.error("Error deleting sale:", err);
        return res.status(500).json({ error: err.message });
    }
};

exports.addsaleitem = async (req, res) => {
    return notImplemented("addsaleitem", req, res);
};

exports.removesaleitem = async (req, res) => {
    return notImplemented("removesaleitem", req, res);
};

exports.summaryreport = async (req, res) => {
    try {
        const fromInput = req.query.from || req.query.date_from || req.query.start_date;
        const toInput = req.query.to || req.query.date_to || req.query.end_date;

        const now = new Date();
        const defaultDate = formatDateYmd(now);

        const dateFrom = String(fromInput || defaultDate).trim();
        const dateTo = String(toInput || defaultDate).trim();
        const parsedFrom = parseYmdToDate(dateFrom);
        const parsedTo = parseYmdToDate(dateTo);

        if (!parsedFrom || !parsedTo) {
            return res.status(400).json({
                error: "Invalid date format. Expected YYYY-MM-DD"
            });
        }

        if (parsedFrom > parsedTo) {
            return res.status(400).json({
                error: "Invalid date range. `from` must be before or equal to `to`"
            });
        }

        const summaryRows = await db.sequelize.query(
            `SELECT
                COALESCE(SUM(total), 0) AS total_sales,
                COUNT(*) AS receipts,
                COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash' THEN total ELSE 0 END), 0) AS cash_total,
                COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(payment_method, ''))) = 'card' THEN total ELSE 0 END), 0) AS card_total
             FROM tblpos_sale
             WHERE DATE(dateactivated) BETWEEN :dateFrom AND :dateTo
               AND dateinactivated IS NULL`,
            {
                replacements: { dateFrom, dateTo },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        const topServiceRows = await db.sequelize.query(
            `SELECT
                TRIM(servicename) AS servicename,
                COUNT(*) AS quantity,
                COALESCE(SUM(price), 0) AS amount
             FROM tblpos_sale_service
                         WHERE DATE(dateactivated) BETWEEN :dateFrom AND :dateTo
               AND TRIM(COALESCE(servicename, '')) <> ''
             GROUP BY TRIM(servicename)
             ORDER BY amount DESC, quantity DESC
             LIMIT 5`,
            {
                replacements: { dateFrom, dateTo },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        const toNumber = (value) => Number(value) || 0;
        const toMoney = (value) => Number(toNumber(value).toFixed(2));

        const summary = summaryRows[0] || {};
        const totalSales = toMoney(summary.total_sales);
        const receipts = Math.max(0, Math.trunc(toNumber(summary.receipts)));
        const cashTotal = toMoney(summary.cash_total);
        const cardTotal = toMoney(summary.card_total);
        const averageTicket = receipts > 0 ? toMoney(totalSales / receipts) : 0;

        const mixBase = totalSales > 0 ? totalSales : 0;
        const cashPct = mixBase > 0 ? Math.round((cashTotal / mixBase) * 100) : 0;
        const cardPct = mixBase > 0 ? Math.round((cardTotal / mixBase) * 100) : 0;

        const topServices = topServiceRows.map((row) => ({
            name: row.servicename,
            quantity: Math.max(0, Math.trunc(toNumber(row.quantity))),
            amount: toMoney(row.amount)
        }));

        return res.status(200).json({
            date_from: dateFrom,
            date_to: dateTo,
            total_sales: totalSales,
            receipts,
            cash_total: cashTotal,
            card_total: cardTotal,
            average_ticket: averageTicket,
            payment_mix: [
                { method: "cash", amount: cashTotal, percentage: cashPct },
                { method: "card", amount: cardTotal, percentage: cardPct }
            ],
            top_services: topServices
        });
    } catch (err) {
        console.error("Error fetching daily POS summary:", err);
        return res.status(500).json({ error: err.message });
    }
};

exports.dailyreport = async (req, res) => {
    try {
        const fromInput = req.query.from || req.query.date_from || req.query.start_date;
        const toInput = req.query.to || req.query.date_to || req.query.end_date;

        const now = new Date();
        const defaultTo = formatDateYmd(now);
        const defaultFromDate = new Date(now);
        defaultFromDate.setDate(defaultFromDate.getDate() - 13);
        const defaultFrom = formatDateYmd(defaultFromDate);

        const dateFrom = String(fromInput || defaultFrom).trim();
        const dateTo = String(toInput || defaultTo).trim();

        const parsedFrom = parseYmdToDate(dateFrom);
        const parsedTo = parseYmdToDate(dateTo);

        if (!parsedFrom || !parsedTo) {
            return res.status(400).json({
                error: "Invalid date format. Expected YYYY-MM-DD"
            });
        }

        if (parsedFrom > parsedTo) {
            return res.status(400).json({
                error: "Invalid date range. `from` must be before or equal to `to`"
            });
        }

        const maxRangeInDays = 62;
        const dayDiff = Math.floor((parsedTo.getTime() - parsedFrom.getTime()) / 86400000) + 1;
        if (dayDiff > maxRangeInDays) {
            return res.status(400).json({
                error: `Date range is too large. Maximum ${maxRangeInDays} days allowed`
            });
        }

        const salesRows = await db.sequelize.query(
            `SELECT
                s.pkey,
                COALESCE(s.total, 0) AS total,
                COALESCE(NULLIF(TRIM(s.payment_method), ''), 'unknown') AS payment_method,
                s.dateactivated
             FROM tblpos_sale s
             WHERE DATE(s.dateactivated) BETWEEN :dateFrom AND :dateTo
               AND s.dateinactivated IS NULL
             ORDER BY s.dateactivated DESC, s.pkey DESC`,
            {
                replacements: { dateFrom, dateTo },
                type: db.sequelize.QueryTypes.SELECT
            }
        );

        const saleKeys = salesRows
            .map((row) => String(row.pkey || "").trim())
            .filter(Boolean);

        const servicesBySaleKey = {};
        if (saleKeys.length > 0) {
            const saleKeyPlaceholders = saleKeys.map((_, idx) => `:salekey${idx}`);
            const saleKeyReplacements = saleKeys.reduce((acc, key, idx) => {
                acc[`salekey${idx}`] = key;
                return acc;
            }, {});

            const serviceRows = await db.sequelize.query(
                `SELECT
                    sale_key,
                    TRIM(COALESCE(servicename, '')) AS servicename,
                    COALESCE(price, 0) AS price
                 FROM tblpos_sale_service
                 WHERE sale_key IN (${saleKeyPlaceholders.join(",")})
                 ORDER BY sale_key DESC, pkey ASC`,
                {
                    replacements: saleKeyReplacements,
                    type: db.sequelize.QueryTypes.SELECT
                }
            );

            serviceRows.forEach((row) => {
                const saleKey = String(row.sale_key || "").trim();
                if (!servicesBySaleKey[saleKey]) {
                    servicesBySaleKey[saleKey] = [];
                }

                servicesBySaleKey[saleKey].push({
                    name: String(row.servicename || "").trim(),
                    price: toMoney(row.price)
                });
            });
        }

        const reportRows = salesRows.map((row) => {
            const saleKey = String(row.pkey || "").trim();
            const label = `#${saleKey}`;

            const paymentMethod = String(row.payment_method || "unknown").toLowerCase();
            const itemDate = new Date(row.dateactivated);
            const dayKey = formatDateYmd(itemDate);

            return {
                sale_key: saleKey,
                label,
                payment_method: paymentMethod,
                amount: toMoney(row.total),
                datetime: row.dateactivated,
                day_key: dayKey,
                week_key: getWeekStartYmd(itemDate)
            };
        });

        let totalIncome = 0;
        let cashTotal = 0;
        let cardTotal = 0;

        const weekMap = new Map();

        reportRows.forEach((row) => {
            totalIncome += row.amount;
            if (row.payment_method === "cash") {
                cashTotal += row.amount;
            } else if (row.payment_method === "card") {
                cardTotal += row.amount;
            }

            if (!weekMap.has(row.week_key)) {
                weekMap.set(row.week_key, {
                    week_start: row.week_key,
                    total: 0,
                    daysMap: new Map()
                });
            }

            const weekEntry = weekMap.get(row.week_key);
            weekEntry.total += row.amount;

            if (!weekEntry.daysMap.has(row.day_key)) {
                weekEntry.daysMap.set(row.day_key, {
                    date: row.day_key,
                    total: 0,
                    receipts: []
                });
            }

            const dayEntry = weekEntry.daysMap.get(row.day_key);
            dayEntry.total += row.amount;
            dayEntry.receipts.push({
                sale_key: row.sale_key,
                datetime: row.datetime,
                label: row.label,
                payment_method: row.payment_method,
                amount: row.amount
            });
        });

        const weeks = Array.from(weekMap.values())
            .sort((a, b) => b.week_start.localeCompare(a.week_start))
            .map((weekEntry) => {
                const days = Array.from(weekEntry.daysMap.values())
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((dayEntry) => ({
                        date: dayEntry.date,
                        total: toMoney(dayEntry.total),
                        receipts: dayEntry.receipts
                            .sort((a, b) => {
                                const timeA = new Date(a.datetime).getTime();
                                const timeB = new Date(b.datetime).getTime();
                                return timeB - timeA;
                            })
                            .map((receipt) => ({
                                sale_key: receipt.sale_key,
                                datetime: receipt.datetime,
                                label: receipt.label,
                                payment_method: receipt.payment_method.toUpperCase(),
                                amount: toMoney(receipt.amount)
                            }))
                    }));

                return {
                    week_start: weekEntry.week_start,
                    total: toMoney(weekEntry.total),
                    days
                };
            });

        return res.status(200).json({
            date_from: dateFrom,
            date_to: dateTo,
            totals: {
                income: toMoney(totalIncome),
                cash: toMoney(cashTotal),
                card: toMoney(cardTotal)
            },
            weeks
        });
    } catch (err) {
        console.error("Error fetching POS daily report:", err);
        return res.status(500).json({ error: err.message });
    }
};
