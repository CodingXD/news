import fp from "fastify-plugin";
import fastifyMongodb from "fastify-mongodb";

export default fp(async (fastify, opts) => {
  await fastify.register(fastifyMongodb, {
    url: process.env.MONGO_DRIVER_CORE,
    name: "core",
  });
  await fastify.register(fastifyMongodb, {
    url: process.env.MONGO_DRIVER_MARKETING,
    name: "marketing",
  });
});
