import {Hono} from "hono";
import {OcppVersion} from "./src/ocppVersion";
import {zValidator} from "@hono/zod-validator";
import {z} from "zod";
import {call} from "./src/messageFactory";
import {serve} from "@hono/node-server";
import {StationController} from "./stationController";
import {logger} from "./src/logger";


require("dotenv").config();


function createAdminServer() {
    const stationController = new StationController();
    const adminApi = new Hono();
    adminApi.post("/station",
        zValidator("json", z.object({
            stationName: z.string(),
            backendEndpoint: z.string(),
            basicAuthPassword: z.string().optional(),
            ocppVersion: z.enum([OcppVersion.OCPP_1_6.toString(), OcppVersion.OCPP_2_0_1.toString(), OcppVersion.OCPP_2_1.toString()])
        }))
        , async (c) => {
            const validated = c.req.valid("json");

            try {
                await stationController.createStation({
                    stationName: validated.stationName, backendEndpoint: validated.backendEndpoint, basicAuthPassword: validated.basicAuthPassword,
                    ocppVersion: validated.ocppVersion
                });
                return c.text("Station created successfully: ");
            } catch (e) {
                return c.text("Error creating station:" + e, 500);
            }
        }
    )
    adminApi.delete("/station/:stationName"
        , (c) => {
            const stationName = c.req.param("stationName");
            if (!stationName) {return c.text("Stationname must not be empty", 400)}
            try {
                stationController.deleteStation(stationName);
                return c.text("Station created successfully: ");
            } catch (e) {
                return c.text("Error creating station:" + e, 500);
            }
        }
    )

    adminApi.post(
        "/:stationName/execute",
        zValidator(
            "json",
            z.object({
                action: z.string(),
                payload: z.any(),
                messageId: z.string().optional(),
            }),
        ),
        (c) => {
            const validated = c.req.valid("json");
            const stationName = c.req.param("stationName");
            let ocppCall = call(validated.action, validated.payload);
            if (validated.messageId) { ocppCall.messageId = validated.messageId }
            stationController.send(stationName, ocppCall);
            return c.text("OK");
        },
    );
    return {adminApi};
}


function startAdminServer() {
    const {adminApi} = createAdminServer();
    const adminPort = Number.parseInt(process.env.ADMIN_PORT ?? "9999")
    logger.info(`Starting admin server on ${adminPort}`);
    serve({
        fetch: adminApi.fetch,
        port: adminPort
    });
}

const startStation = async (version: OcppVersion) => {
    const adminPort = Number.parseInt(process.env.ADMIN_PORT ?? "9999");
    await fetch(`http://localhost:${adminPort}/station`, {
        method: "POST",
        body: JSON.stringify({
            stationName: process.env.STATION_NAME ?? "123456",
            backendEndpoint: process.env.WS_URL ?? "ws://localhost:3000",
            basicAuthPassword: process.env.PASSWORD ?? undefined,
            ocppVersion: version.toString(),
        }),
        headers: {
            "Content-Type": "application/json",
        },
    });
}

if (require.main === module) {
    startAdminServer();
    switch (process.env.OCPP_VERSION) {
        case "1.6":
            startStation(OcppVersion.OCPP_1_6);
            break;
        case "2.0.1":
            startStation(OcppVersion.OCPP_2_0_1);
            break;
        case "2.1":
            startStation(OcppVersion.OCPP_2_1);
            break;
        default:
            logger.info("No OCPP version specified. Starting no station");
    }
}