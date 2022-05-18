const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
var jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@doctors.pa75l.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

async function run() {
    try {
        await client.connect();
        console.log("db coneected");
        const servicesCollection = client
            .db("doctors_portal")
            .collection("services");
        const bookingCollection = client
            .db("doctors_portal")
            .collection("bookings");
        const userCollection = client.db("doctors_portal").collection("users");

        app.get("/services", async (req, res) => {
            const result = await servicesCollection.find({}).toArray();
            res.send(result);
        });

        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(
                filter,
                updateDoc,
                options
            );
            const token = jwt.sign(
                { email: email },
                process.env.ACCESS_SECRET_KEY,
                { expiresIn: "1d" }
            );
            res.send({ result, token });
        });

        app.get("/available", async (req, res) => {
            const date = req.query.date || "May 17, 2022";

            //step 1: get all services
            const services = await servicesCollection.find().toArray();

            //step 2: get the booking of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            //step 3: for each service find bookings with service
            services.forEach((service) => {
                const serviceBookings = bookings.filter(
                    (b) => b.treatment === service.name
                );
                const booked = serviceBookings.map((s) => s.slot);
                const available = service.slots.filter(
                    (s) => !booked.includes(s)
                );
                service.slots = available;
            });

            res.send(services);
        });

        app.get("/treatment", async (req, res) => {
            const email = req.query.patient;
            const query = { patient: email };
            const result = await bookingCollection.find(query).toArray();
            res.send(result);
        });

        //post per booking
        app.post("/booking", async (req, res) => {
            const booking = req.body;
            const query = {
                treatment: booking.treatment,
                date: booking.date,
                patient: booking.patient,
            };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists });
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true });
        });
    } finally {
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Hello From Doctos Portal!");
});

app.listen(port, () => {
    console.log(`Doctors listening on port ${port}`);
});
