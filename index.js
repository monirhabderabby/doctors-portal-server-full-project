const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
var jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
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

//Email sending from DB
var EmailSenderOptions = {
    auth: {
      api_key: process.env.EMAIL_SENDER_KEY
    }
  }

  var EmailSenderclient = nodemailer.createTransport(sgTransport(EmailSenderOptions));

  function sendAppoinmentEmail (booking){
      const {patient, treatment, date, patientName, slot} = booking;
      var email = {
        from: 'monirhrabby.programmer@gmail.com',
        to: patient,
        subject: `Your Appoinment is for ${treatment} on ${date} at ${slot} is Confirmed`,
        text: `Your Appoinment is for ${treatment} on ${date} at ${slot} is Confirmed`,
        html: `
        <div>
        <p> Hello ${patientName}, </p>
        <h3>Your Appointment for ${treatment} is confirmed</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}.</p>
        
        <h3>Our Address</h3>
        <p>Andor Killa Bandorban</p>
        <p>Bangladesh</p>
        <a href="https://web.programming-hero.com/">unsubscribe</a>
      </div>
        
        
        `
      };

      EmailSenderclient.sendMail(email, function(err, info){
        if (err ){
          console.log(err);
        }
        else {
          console.log('Message sent: ', info);
        }
    });
  }



//Verification JSON WEB Token
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "unAuthorized access" });
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_SECRET_KEY, function (err, decoded) {
        if (err) {
            return res.status(403).send({ mesage: "Forbidden Access" });
        }
        req.decoded = decoded;
        next();
    });
}

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
        const doctorCollection = client.db("doctors_portal").collection("doctors");

        //Custom MiddlwWare
        const verifyAdmin = async (req, res, next)=>{
            const requester = req.decoded.email;
            const requestedAccount = await userCollection.findOne({email: requester});
            if(requestedAccount.role === 'admin'){
                return next();
            }
            else{
                res.status(403).send({message: "Forbidden Access"})
            }
        }

        app.get("/services", async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({name: 1});
            const result = await cursor.toArray();
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

        app.get("/treatment", verifyJWT, async (req, res) => {
            const email = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { patient: email };
                const result = await bookingCollection.find(query).toArray();
                return res.send(result);
            } else {
                return res.status(403).send({ message: "ForBidden Access" });
            }
        });

        app.get('/user', verifyJWT, async (req, res)=> {
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        //get all doctor information
        app.get('/doctor',verifyJWT, verifyAdmin, async (req, res)=> {
            const result = await doctorCollection.find().toArray()
            res.send(result);
        })

        app.put("/user/admin/:email",verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };  
            const updateDoc = {
                $set: {role: "admin"},
            };
            const result = await userCollection.updateOne(
                filter,
                updateDoc
            );
            res.send (result);
            
        }
            
        );

        app.get('/user/checkAdmin/:email', async (req, res)=> {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user?.role === 'admin'
            res.send({admin: isAdmin})
        })

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
            sendAppoinmentEmail(booking);
            res.send({ success: true });
        });

        app.put('/doctor',verifyJWT, async (req, res)=> {
            const doctor = req.body;
            const query = {email: doctor.email}
            const exists = await doctorCollection.findOne(query);
            if(exists){
                res.send({acknowledged: false})
                
            }
            else{
                const result = await doctorCollection.insertOne(doctor);
                res.send(result)
            }
        })

        app.delete('/doctor/:email',verifyJWT, async (req, res)=> {
            const email = req.params.email;
            const filter = {email: email};
            const result = await doctorCollection.deleteOne(filter);
            res.send(result)
        })
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
