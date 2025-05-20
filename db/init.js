const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db;

async function connectToDatabase() {
    if (!db) {
        await client.connect();
        db = client.db('focusBot'); // Or whatever your DB name is
    }
    return db;
}

module.exports = { connectToDatabase };
