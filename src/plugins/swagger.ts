import fp from "fastify-plugin";
import fastifySwagger, { FastifySwaggerOptions } from "fastify-swagger";

export default fp<FastifySwaggerOptions>(async (fastify, opts) => {
  fastify.register(fastifySwagger, {
    routePrefix: "/documentation",
    swagger: {
      info: {
        title: "Suitejar APIs",
        description: "",
        version: "0.2.0",
      },
      swagger: "2.0",
      host: "api.suitejar.com",
      schemes: ["https"],
      consumes: ["application/json"],
      produces: ["application/json"],
      tags: [
        {
          name: "User",
          description: "Store, retrieve, update or delete user details",
        },
        {
          name: "Url",
          description: "Store, retrieve or delete website information",
        },
        {
          name: "Reminder",
          description: "Set, retrieve or delete reminders",
        },
        {
          name: "Reporting",
          description: "Get reports on website progress, alerts and more",
        },
        { name: "Marketing", description: "Storing user activity" },
        { name: "Unstable", description: "Not ready for Production" },
      ],
    },
    exposeRoute: true,
  });
});
