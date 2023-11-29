const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
const noIdPassURI = process.env.LOCAL_URI;
const uri = noIdPassURI
  .replace("<username>", process.env.DB_USER)
  .replace("<password>", process.env.DB_PASS);

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const coverageCollection = client
      .db(process.env.DB_NAME)
      .collection("coverageArea");

    // coverage api
    app.get("/coverage", async (req, res) => {
      const { page, limit } = req.query;
      const result = await coverageCollection
        .find()
        .skip(+page * +limit)
        .limit(+limit)
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send({ message: "NiyeJai Jawar jonno ready..." });
});

app.listen(port, () => {
  console.log(`NiyeJai is alive in port ${port}`);
});
