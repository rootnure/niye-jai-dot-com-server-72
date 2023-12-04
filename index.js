const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SK);
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const moment = require("moment/moment");
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
    const userCollection = client.db(databaseName).collection("users");
    const bookingCollection = client.db(databaseName).collection("bookings");
    const reviewCollection = client.db(databaseName).collection("reviews");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req?.headers?.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req?.headers?.authorization.split(" ")[1];
      jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "Admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    /* review related api */
    // post or update a review
    app.patch("/reviews", async (req, res) => {
      const reviewData = req.body;
      const filter = { bookingId: reviewData?.bookingId };
      const review = {
        $set: {
          reviewBy: {
            name: reviewData?.reviewBy?.name,
            photo: reviewData?.reviewBy?.photo,
          },
          rating: reviewData?.rating,
          feedback: reviewData?.feedback,
          deliveryMenId: reviewData?.deliveryMenId,
          bookingId: reviewData?.bookingId,
          reviewDate: moment(new Date()).format("YYYY-MM-DD"),
        },
      };
      const options = { upsert: true };
      const result = await reviewCollection.updateOne(filter, review, options);
      res.send(result);
    });

    // get all review based on rider id
    app.get("/my-review/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { deliveryMenId: id };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    /* bookings related api */
    // create a new booking
    app.post("/bookings", verifyToken, async (req, res) => {
      const data = req.body;
      const dataForDB = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        type: data.type,
        weight: parseFloat(data.weight),
        deliveryFee: data.weight <= 1 ? 50 : data.weight <= 2 ? 100 : 150,
        receiverName: data.receiverName,
        receiverPhone: data.receiverPhone,
        deliveryAddress: data.deliveryAddress,
        reqDeliveryDate: data.reqDeliveryDate,
        deliveryLat: parseFloat(data.deliveryLat),
        deliveryLon: parseFloat(data.deliveryLon),
        deliveryMen: null,
        approxDeliveryDate: null,
        status: "Pending",
        bookingDate: moment(new Date()).format("YYYY-MM-DD"),
      };
      const result = await bookingCollection.insertOne(dataForDB);
      res.send(result);
    });

    // get all bookings by admin only
    app.get("/bookings", verifyToken, async (req, res) => {
      const { dateFrom, dateTo } = req.query;
      const query =
        dateFrom && dateTo
          ? {
              $and: [
                { bookingDate: { $gte: dateFrom } },
                { bookingDate: { $lte: dateTo } },
              ],
            }
          : {};
      const options = {
        projection: {
          name: 1,
          phone: 1,
          bookingDate: 1,
          reqDeliveryDate: 1,
          deliveryFee: 1,
          status: 1,
        },
      };
      const result = await bookingCollection.find(query, options).toArray();
      res.send(result);
    });

    // get booking based on user email
    app.get("/bookings/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    // get bookings by assigned rider
    app.get("/my-consignments/:uId", verifyToken, async (req, res) => {
      const deliveryMen = req.params.uId;
      const query = { deliveryMen: deliveryMen };
      const options = {
        projection: {
          name: 1,
          receiverName: 1,
          phone: 1,
          reqDeliveryDate: 1,
          approxDeliveryDate: 1,
          receiverPhone: 1,
          deliveryAddress: 1,
          deliveryLat: 1,
          deliveryLon: 1,
          status: 1,
        },
      };
      const result = await bookingCollection.find(query, options).toArray();
      res.send(result);
    });

    // get single booking based on booking id
    app.get("/booking/:id", verifyToken, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    // update booking data by id
    app.patch("/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const newData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...newData,
        },
      };
      const result = await bookingCollection.updateOne(query, updateDoc);
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
    app.get("/users", verifyToken, async (req, res) => {
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
        projection: { role: 1 },
      };
      const result = await userCollection.findOne(query, options);
      res.send(result);
    });

    // update user role by admin only
    app.patch(
      "/update-role/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const newRole = req.query.newRole;
        const filter = { email: email };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            role: newRole,
          },
        };
        const result = await userCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    // delete user by admin only
    app.delete(
      "/user-delete/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        // console.log(query);
        const result = await userCollection.deleteOne(query);
        res.send(result);
      }
    );

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
      const deliveryCount = await bookingCollection
        .find({ status: "Delivered" }, { projection: { _id: 1 } })
        .toArray();
      const userCount = await userCollection
        .find({ role: "User" }, { projection: { _id: 1 } })
        .toArray();
      res.send({
        bookingCount,
        deliveryCount: deliveryCount.length,
        userCount: userCount.length,
      });
    });

    /* payment */
    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      const price = parseInt(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
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
