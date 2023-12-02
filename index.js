const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

const databaseName = process.env.DB_NAME;

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const coverageCollection = client
      .db(databaseName)
      .collection("coverageArea");
    const userCollection = client.db(databaseName).collection("users");
    const bookingCollection = client.db(databaseName).collection("bookings");

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

    /* users related api */
    // create new user to DB
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user) {
        return res.send({ message: "User Already Registered" });
      }
      const { role, createdOn, name, photo } = req.body;
      const newUser = {
        email,
        createdOn,
        role,
        name,
        photo,
      };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // Get Users based on role (All users will be return if no role is provided)
    app.get("/users", async (req, res) => {
      const role = req.query.role; // /users?role=Admin
      const query = role === "All" || !role ? {} : { role: role };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // get user role based on user email
    app.get("/user-role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const options = {
        projection: { _id: 0, role: 1 },
      };
      const result = await userCollection.findOne(query, options);
      res.send(result);
    });

    // update user role by admin only
    app.patch("/update-role/:email", async (req, res) => {
      const email = req.params.email;
      const newRole = req.query.newRole;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: newRole,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // delete user by admin only
    app.delete("/user-delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      // console.log(query);
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // get top riders based on ratingAvg and deliveryCount
    app.get("/top-riders", async (req, res) => {
      const query = { role: "Rider" };
      const optionsRatingAvg = {
        sort: { ratingAvg: -1 },
        projection: { name: 1, photo: 1, ratingAvg: 1, deliveryCount: 1 },
      };
      const byRating = await userCollection
        .find(query, optionsRatingAvg)
        .limit(5)
        .toArray();
      const optionsDeliveryCount = {
        sort: { deliveryCount: -1 },
        projection: { name: 1, photo: 1, ratingAvg: 1, deliveryCount: 1 },
      };
      const byDelivery = await userCollection
        .find(query, optionsDeliveryCount)
        .limit(5)
        .toArray();
      res.send({ byRating, byDelivery });
    });

    /* count api */
    // get collection counts for states
    app.get("/counter", async (req, res) => {
      const bookingCount = await bookingCollection.estimatedDocumentCount();
      const deliveryCount = await bookingCollection.estimatedDocumentCount({
        status: "Delivered",
      });
      const userCount = await userCollection.estimatedDocumentCount();
      res.send({ bookingCount, deliveryCount, userCount });
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
