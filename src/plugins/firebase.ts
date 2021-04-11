import fp from "fastify-plugin";
import * as admin from "firebase-admin";

export default fp(async (fastify, opts) => {
  if (!admin.apps.length) {
    fastify.decorate(
      "firebase",
      admin.initializeApp({
        credential: admin.credential.cert(
          require("../../suitejar-22764-firebase-adminsdk-hab7d-457aa15134.json")
        ),
      })
    );
  }
});

declare module "fastify" {
  export interface FastifyInstance {
    firebase: typeof admin;
  }
}
