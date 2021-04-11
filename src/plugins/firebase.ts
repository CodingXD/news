// import fp from "fastify-plugin";
// import * as admin from "firebase-admin";

// export default fp(async (fastify, opts) => {
//   if (!admin.apps.length) {
//     fastify.decorate(
//       "firebase",
//       admin.initializeApp({
//         credential: admin.credential.cert(
//           require("../../suitejar-firebase-adminsdk.json")
//         ),
//       })
//     );
//   }
// });

// declare module "fastify" {
//   export interface FastifyInstance {
//     firebase: typeof admin;
//   }
// }
