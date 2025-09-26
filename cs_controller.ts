import {Hono} from "hono";
import {OcppVersion} from "./src/ocppVersion";
import {bootNotificationOcppOutgoing} from "./src/v201/messages/bootNotification";
import {statusNotificationOcppOutgoing} from "./src/v201/messages/statusNotification";
import {VCP} from "./src/vcp";
import {zValidator} from "@hono/zod-validator";
import {z} from "zod";
import {call} from "./src/messageFactory";
import {serve} from "@hono/node-server";
import type {OcppCall} from "./src/ocppMessage";

require("dotenv").config();
export type Station = {
    stationName: string,
    backendEndpoint: string,
    basicAuthPassword: string,
    ocppVersion: string
}

export class occpController {
    private chargingStations: Map<String, VCP> = new Map<string, VCP>();

    async createStation(station: Station) {

        const vcp = new VCP({
                endpoint: station.backendEndpoint ?? process.env.WS_URL ?? "ws://localhost:3000",
                chargePointId: station.stationName ?? "11222",
                ocppVersion: OcppVersion.OCPP_2_0_1,
                basicAuthPassword: process.env.PASSWORD ?? undefined
            }
        );
        await vcp.connect();

        vcp.send(
            bootNotificationOcppOutgoing.request({
                reason: "PowerUp",
                chargingStation: {
                    model: "VirtualChargePoint",
                    vendorName: "Solidstudio",
                },
            }),
        );
        vcp.send(
            statusNotificationOcppOutgoing.request({
                evseId: 1,
                connectorId: 1,
                connectorStatus: "Available",
                timestamp: new Date().toISOString(),
            }),
        );
        this.chargingStations.set(station.stationName, vcp);
    }

    send(stationName: string, ocppCall: OcppCall<any>) {
        this.chargingStations.get(stationName)?.send(ocppCall);
    }

}


const controller = new occpController();
const adminApi = new Hono();
adminApi.post("/station",
    zValidator("json", z.object({
        stationName: z.string(),
        backendEndpoint: z.string(),
        basicAuthPassword: z.string(),
        ocppVersion: z.enum([OcppVersion.OCPP_1_6.toString(), OcppVersion.OCPP_2_0_1.toString(), OcppVersion.OCPP_2_1.toString()])
    }))
    , (c) => {
        const validated = c.req.valid("json");
        (async () => await controller.createStation({
            stationName: validated.stationName, backendEndpoint: validated.backendEndpoint, basicAuthPassword: validated.basicAuthPassword,
            ocppVersion: validated.ocppVersion
        }))();
        return c.text("OK")
    }
)

adminApi.post(
    "/:stationName/execute",
    zValidator(
        "json",
        z.object({
            action: z.string(),
            payload: z.any(),
        }),
    ),
    (c) => {
        const validated = c.req.valid("json");
        const stationName = c.req.param("stationName");
        controller.send(stationName, call(validated.action, validated.payload));
        return c.text("OK");
    },
);


serve({
    fetch: adminApi.fetch,
    port: 9999,
});


// fetch(`http://localhost:${adminPort}/station`, {
//     method: "POST",
//     body: JSON.stringify({
//         stationName: "Test station",
//         backendEndpoint: "ws://localhost:8887/ws",
//         basicAuthPassword: "testPassword",
//         occpVersion:  OcppVersion.OCPP_2_0_1
//     }),
//     headers: {
//         "Content-Type": "application/json",
//     },
// });