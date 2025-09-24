/**
 * Reading smtp user/pwd from environment variable within this lib is not recommended.
 * The constructor should have 2 paramenters to have user/pwd
 * It's Emailer caller's responsibililty to pass in user/password
 *
 *
 * In local dev environment, process.env.DEBUG must be true for this mailer to read
 * SMTP credentials it needs to work
 */
const nodemailer = require("nodemailer");
const { join } = require('node:path');
const dotenv = require('dotenv');

function showDebugMsg(...args) {
    if (process.env.DEBUG === 'true')
        console.log(...args);
}

if (process.env.DEBUG === 'true') {
    dotenv.config({ path: join(__dirname, '.env.mailerConfig') });
}

showDebugMsg("[johnMailer.top level] user", process.env.mailjet_API_KEY);
showDebugMsg("[johnMailer.top level] secrect", process.env.mailjet_Secrect);

class Emailer {
    constructor() {
        showDebugMsg("[johnMailer.constructor] user", process.env.mailjet_API_KEY);
        showDebugMsg("[johnMailer.constructor] secrect", process.env.mailjet_Secrect);
        this.transporter = nodemailer.createTransport({
            host: 'in-v3.mailjet.com',
            port: 465,
            auth: {
                user: process.env.mailjet_API_KEY,
                pass: process.env.mailjet_Secrect,
            },
        });
        if (!this.transporter) {
            showDebugMsg("[johnMailer.constructor] transporter wasn't created");
        } else {
            showDebugMsg("[johnMailer.constructor] transporter meta", this.transporter.meta);
            showDebugMsg("[johnMailer.constructor] transporter options", this.transporter.options);
            showDebugMsg("[johnMailer.constructor] transporter.transporter.name", this.transporter.transporter.name);
        }
    }

    async sendEmail(mailOptions) {
        return await this.transporter.sendMail(mailOptions);
    }

    sendEmailTo(receipiant, subject, text, htmlBody) {
        let msg = {
            from: process.env.FROM_ADDRESS,
            to: receipiant,
            subject: subject,
            text: text,
            html: htmlBody,
        };
        this.sendEmail(msg);
    }
}

module.exports = { Emailer };
//
// Usage Demo
//
//  * In local dev environment, process.env.DEBUG must be true for this mailer to read
//  * SMTP credentials it needs to work
// let user = process.env.MAILUSER as string;
// let pass = process.env.MAILPASSWORD as string;
// const emailer = new Emailer(user, pass);
// let receipiant = 'johnlan@gmail.com';
// let subject = 'Send @' + (new Date(Date.now()).toString());
// let text = "Text version body: Welcome to the our website";
// let htmlBody = `
//   <h1>HTML version body!</h1>
//   <p>We're glad you've decided to join us. We hope you find everything you're looking for here and enjoy using our site.</p>
// `;
// emailer.sendEmailTo(receipiant,subject,text,htmlBody)
// // intentionally add something useless here to test when email is sent
// console.log('please set breakpoint here, end of script')
