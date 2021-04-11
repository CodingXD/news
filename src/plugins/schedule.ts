import fp from "fastify-plugin";
import fetch from "node-fetch";
import { scheduleJob } from "node-schedule";
import { load } from "cheerio";
import requestPromise from "request-promise";
const { parseString } = require("xml2js");

export default fp(async (fastify, opts) => {
  fastify.ready(async (err) => {
    if (err) throw err;
    // Check for Reminders and start them, if any
    interface Reminder {
      user: string;
      reminder: {
        frequency: string;
        day: string;
        time: string;
        timezone: string;
      };
    }

    const reminders: Reminder[] = [];
    await fastify.mongo.core.db
      .collection("reminders")
      .find()
      .project({ _id: 0 })
      .forEach((doc: Reminder) => {
        reminders.push(doc);
      });

    if (reminders.length > 0) {
      reminders.map(async ({ reminder: { frequency, time, day }, user }) => {
        const email = user;
        const weekday: string[] = new Array(7);
        weekday[0] = "sunday";
        weekday[1] = "monday";
        weekday[2] = "tuesday";
        weekday[3] = "wednesday";
        weekday[4] = "thursday";
        weekday[5] = "friday";
        weekday[6] = "saturday";

        const frequencyType =
          frequency.split(" ")[0].charAt(0).toUpperCase() +
          frequency.split(" ")[0].slice(1);

        let rule = `${parseInt(time.slice(3))} ${parseInt(
          time.slice(0, 2)
        )} * * *`;

        if (frequency == "weekly once") {
          rule = `${parseInt(time.slice(3))} ${parseInt(
            time.slice(0, 2)
          )} * * ${day.slice(0, 3).toUpperCase()}`;
        }

        if (frequency == "monthly once") {
          rule = `${parseInt(time.slice(3))} ${parseInt(
            time.slice(0, 2)
          )} 1 * ${day.slice(0, 3).toUpperCase()}`;
        }

        scheduleJob(rule, async function () {
          const user = await fastify.mongo.core.db
            .collection("users")
            .findOne({ email }, { projection: { _id: 0, name: 1 } });
          await fetch(`${process.env.SIB_API_URL}/smtp/email`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "api-key": process.env.SIB_API_KEY as string,
            },
            body: JSON.stringify({
              sender: {
                name: "Suitejar Team",
                email: process.env.SIB_SENDER,
              },
              to: [{ email, name: user.name }],
              replyTo: {
                email: process.env.SIB_REPLY_TO,
                name: "Suitejar Team",
              },
              htmlContent:
                "<!DOCTYPE html> <html> <body> <h5>Here's your reminder</h5> <p>Just kidding...</p> </body> </html>",
              textContent: "Just kidding...",
              subject: `Your ${frequencyType} Reminder`,
            }),
          });

          await fastify.mongo.core.db.collection("logs").updateOne(
            { user: email, type: "reminder" },
            {
              $push: {
                logs: {
                  message: `${frequencyType} Reminder sent to ${user.name}`,
                  date: new Date(),
                },
              },
            },
            { upsert: true }
          );
        });
      });
    }

    // Re check all websites every 24 hours
    scheduleJob("0 0 * * *", async function () {
      interface Website {
        _id: string;
        url: string;
        user: string;
        domain: string;
      }
      const websites: Website[] = [];
      await fastify.mongo.core.db
        .collection("websites")
        .find()
        .project({ _id: 0, url: 1, user: 1, domain: 1 })
        .forEach((doc) => {
          websites.push(doc);
        });

      interface Urls {
        url: string;
        lastModified: Date | string;
        wordcount: number;
        status: Status[];
      }

      interface Status {
        message: string;
        color: string;
      }

      let maxSitemaps = 0;
      let maxUrls = 0;
      let currentSitemap = 0;
      let urlsParsed = 0;
      const urlData: Urls[] = [];
      let exceededFreeTier = false;
      let finished = false;
      let name: string;
      let tier: string;
      let email: string;
      let domain: string;

      interface Sitemap {
        loc: string[] | string;
        lastmod?: Date;
        "image:image"?: any[];
      }

      interface Urlset {
        $: {
          xmlns?: string;
          "xmlns:xhtml"?: string;
          "xmlns:image"?: string;
          "xsi:schemaLocation"?: string;
          "xmlns:xsi"?: string;
        };
        url: Sitemap[];
      }

      interface SitemapIndex {
        $: { xmlns: string };
        sitemap: Sitemap[];
      }

      function parseSitemap(sitemap: string) {
        requestPromise({
          uri: sitemap,
          transform: function (body) {
            return load(body, {
              xmlMode: true,
            });
          },
        })
          .then(($) => {
            parseString($.xml(), async function (err, results: any) {
              if (err) {
                console.error(err);
              }

              if (typeof results != "undefined" || results != null) {
                if (!results.html) {
                  if (results && results.urlset) {
                    if (typeof results.urlset.url == "object") {
                      maxUrls += results.urlset.url.length;
                      if (maxSitemaps > 0) currentSitemap++;
                      for (let i = 0; i < results.urlset.url.length; i++) {
                        if (tier == "free" && urlData.length > 1000) {
                          urlsParsed++;
                          exceededFreeTier = true;
                          break;
                        }

                        const loc: string =
                          typeof results.urlset.url[i].loc == "object"
                            ? results.urlset.url[i].loc[0]
                            : results.urlset.url[i].loc;
                        if (loc.length != 0) {
                          if (loc.endsWith("sitemap.xml")) {
                            parseSitemap(loc);
                          }
                          urlsParsed++;
                          const lastmod = results.urlset.url[i].lastmod;
                          let lastModified: string;
                          if (typeof lastmod == "object") {
                            lastModified = lastmod[0];
                          } else if (typeof lastmod == "undefined") {
                            lastModified = "lastmod is missing";
                          } else {
                            lastModified = lastmod;
                          }

                          urlData.push({
                            url: loc,
                            lastModified,
                            wordcount: 0,
                            status: [],
                          });

                          if (
                            currentSitemap == maxSitemaps &&
                            urlsParsed == maxUrls &&
                            urlsParsed == urlData.length
                          ) {
                            finished = true;
                          }
                        }
                      }
                    }
                  } else if (results && results.sitemapindex) {
                    maxSitemaps = results.sitemapindex.sitemap.length;
                    for (
                      let i = 0;
                      i < results.sitemapindex.sitemap.length;
                      i++
                    ) {
                      let sitemap: string =
                        typeof results.sitemapindex.sitemap[i].loc == "object"
                          ? results.sitemapindex.sitemap[i].loc[0]
                          : results.sitemapindex.sitemap[i].loc;
                      if (sitemap.endsWith("/")) {
                        sitemap = sitemap.slice(0, -1);
                      }

                      if (sitemap.endsWith("sitemap.xml")) {
                        parseSitemap(sitemap);
                      } else {
                        parseSitemap(`${sitemap}/sitemap.xml`);
                      }
                    }
                  }
                }
              }
            });
          })
          .then(() => {
            async function updateWordCount() {
              for (let i = 0; i < urlData.length; i++) {
                requestPromise({
                  uri: urlData[i].url,
                  transform: function (htmlString) {
                    return load(htmlString);
                  },
                })
                  .then(async ($) => {
                    const wordcount = require("wordcount");
                    const wc = await wordcount($.text());
                    urlData[i].wordcount = wc;
                    const lastModified = urlData[i].lastModified;
                    if (lastModified == "lastmod is missing") {
                      urlData[i].status.push({
                        message: "Date is missing",
                        color: "#e63c3c",
                      });

                      if (wc >= 300) {
                        urlData[i].status.push({
                          message: "Great job. Everything looks cool",
                          color: "#2cce50",
                        });
                      } else {
                        urlData[i].status.push({
                          message: "You need to increase the word count",
                          color: "#e63c3c",
                        });
                      }
                    } else {
                      const dateFromSitemap = new Date(lastModified as string);
                      const currentDate = new Date();

                      const Difference_In_Time =
                        currentDate.getTime() - dateFromSitemap.getTime();

                      const Difference_In_Days = Math.round(
                        Difference_In_Time / (1000 * 3600 * 24)
                      );
                      if (Difference_In_Days < 90 && wc >= 300) {
                        urlData[i].status.push({
                          message: "Great job. Everything looks cool",
                          color: "#2cce50",
                        });
                      } else {
                        urlData[i].status.push({
                          message: "You need to increase the word count",
                          color: "#e63c3c",
                        });
                      }
                    }
                  })
                  .then(async () => {
                    if (i == urlData.length - 1) {
                      await fastify.mongo.core.db
                        .collection("websites")
                        .updateOne(
                          {
                            user: email,
                            domain,
                            url: sitemap,
                          },
                          {
                            $set: {
                              urlData,
                              lastModified: new Date(),
                              message: exceededFreeTier
                                ? "You’ve more than 1000 pages. Contact support@suitejar.com to get the whole insights."
                                : "",
                            },
                            $inc: { refreshed: 1 },
                          }
                        );

                      await fastify.mongo.core.db.collection("logs").updateOne(
                        { user: email, type: "website" },
                        {
                          $push: {
                            logs: {
                              message: `Updated urls for ${domain}`,
                              date: new Date(),
                            },
                          },
                        },
                        { upsert: true }
                      );
                    }
                  })
                  .catch((error) => {
                    console.log("error is here");
                    if (
                      error.code != "ECONNRESET" ||
                      error.code != "ETIMEDOUT"
                    ) {
                      console.error(error.message);
                    }
                  });
              }
            }
            if (exceededFreeTier) {
              // console.log("Exceeded 1000 webpages");
              if (urlData.length > 1000) {
                const difference = urlData.length - 1000;
                for (let i = 0; i < difference; i++) {
                  urlData.pop();
                }
                // For sites like surveysparrow, continue remaining code here
                //   console.log("URLs:", urlData.length);
                updateWordCount();
              }
            } else if (finished) {
              // For other smaller sites
              updateWordCount();
            }
          })
          .catch((error) => {
            console.error(error);
          });
      }

      for (let i = 0; i < websites.length; i++) {
        const response = await fastify.mongo.core.db
          .collection("users")
          .findOne(
            { email: websites[i].user },
            { projection: { _id: 0, tier: 1, name: 1 } }
          );
        tier = response.tier;
        name = response.name;
        email = websites[i].user;
        domain = websites[i].domain;
        const url = websites[i].url;
        parseSitemap(url.endsWith("sitemap.xml") ? url : `${url}/sitemap.xml`);
      }
    });
  });
});
