import { WebSocketServer, WebSocket } from 'ws';

// Der Simulator verbindet sich mit diesem Proxy (z.B. ws://localhost:8081)
const wss = new WebSocketServer({ port: 9081 });
console.log("WebSocket-Proxy läuft auf Port 9081...");

wss.on('connection', (wsSimulator,req) => {
    console.log("\n[Proxy] Simulator hat sich neu verbunden.");
    const simulatorUrl = req.url ?? "/";
    const simulatorHeaders = req.headers;
    // Verbindung zur echten Spring Boot App aufbauen (z.B. Port 8080)
    const targetBaseUrl = "ws://localhost:8887/ws/ocpp";
    const targetUrl = `${targetBaseUrl}${simulatorUrl}`;
    const {
        host,
        connection,
        upgrade,
        "sec-websocket-key": secWebSocketKey,
        "sec-websocket-version": secWebSocketVersion,
        "sec-websocket-extensions": secWebSocketExtensions,
        "sec-websocket-protocol": secWebSocketProtocol,
        ...forwardHeaders
    } = simulatorHeaders;

    const protocols = typeof secWebSocketProtocol === "string"
        ? secWebSocketProtocol.split(",").map((protocol) => protocol.trim())
        : undefined;

    const wsApp = new WebSocket(targetUrl, protocols, {
        headers: forwardHeaders,
    });
    // Timer-Referenz, um Memory Leaks zu verhindern
    let disconnectTimeout: NodeJS.Timeout;

    // 1. Daten-Weiterleitung (Bridge) zwischen Simulator und App
    wsSimulator.on('message', (data) => {
        if (wsApp.readyState === WebSocket.OPEN) {
            wsApp.send(data);
        }
    });

    wsApp.on('message', (data) => {
        if (wsSimulator.readyState === WebSocket.OPEN) {
            wsSimulator.send(data);
        }
    });

    // Sobald die Verbindung zur Spring Boot App steht, startet der 10-Sekunden-Timer
    wsApp.on('open', () => {
        console.log("[Proxy] Verbindung zur Spring Boot App erfolgreich hergestellt. Daten fliessen...");

        disconnectTimeout = setTimeout(() => {
            console.log("[Proxy] 10 Sekunden um! Simuliere Abbruch zur App...");

            // 2. Verbindung zur Spring Boot App sauber mit Code 1000 schliessen
            if (wsApp.readyState === WebSocket.OPEN) {
                wsApp.close(1000, "App-seitiger kontrollierter Abbruch");
            }

            // 3. WICHTIG: Wir schliessen JETZT AUCH den Simulator-Socket.
            // Warum? Wenn wir ihn offen lassen, merkt der Simulator den Abbruch nicht sofort.
            // Durch das Schliessen triggern wir JETZT den Reconnect-Mechanismus deines Simulators!
            if (wsSimulator.readyState === WebSocket.OPEN) {
                wsSimulator.close(1000, "Proxy beendet Session");
            }
        }, 10000);
    });

    // Fehler- und Clean-Up-Handling
    wsSimulator.on('close', () => {
        clearTimeout(disconnectTimeout);
        if (wsApp.readyState === WebSocket.OPEN) wsApp.close();
        console.log("[Proxy] Verbindung zum Simulator geschlossen. Warte auf den automatischen Reconnect...");
    });

    wsApp.on('close', () => {
        clearTimeout(disconnectTimeout);
        if (wsSimulator.readyState === WebSocket.OPEN) wsSimulator.close();
        console.log("[Proxy] Verbindung zur Spring Boot App geschlossen.");
    });

    wsSimulator.on('error', (err) => console.error("[Proxy] Simulator Fehler:", err.message));
    wsApp.on('error', (err) => console.error("[Proxy] App Fehler:", err.message));
});