package app.byourside.companion;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLException;
import org.json.JSONObject;

@CapacitorPlugin(name = "LanApi")
public class LanApiPlugin extends Plugin {
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private SharedPreferences preferences() { return getContext().getSharedPreferences("bys_lan_connection", Context.MODE_PRIVATE); }

    @PluginMethod public void connection(PluginCall call) {
        SharedPreferences p = preferences();
        JSObject result = new JSObject();
        result.put("configured", p.contains("server") && p.contains("token") && p.contains("fingerprint"));
        result.put("server", p.getString("server", ""));
        call.resolve(result); // Never return the device credential to JavaScript.
    }
    @PluginMethod public void configure(PluginCall call) {
        try {
            String text = call.getString("pairing", "");
            if (text.length() > 4096) throw new IllegalArgumentException();
            JSONObject config = new JSONObject(text);
            String server = LanSecurity.server(config.getString("server"));
            String pin = LanSecurity.fingerprint(config.getString("certificateSha256"));
            String token = config.getString("token");
            if (config.getInt("version") != 1 || !token.matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException();
            if (!preferences().edit().putString("server", server).putString("token", token).putString("fingerprint", pin).commit()) throw new IllegalStateException();
            JSObject result = new JSObject(); result.put("configured", true); result.put("server", server); call.resolve(result);
        } catch (Exception error) { call.reject("连接配置格式不正确，请完整复制电脑生成的配置。", "INVALID_PAIRING"); }
    }
    @PluginMethod public void forget(PluginCall call) {
        if (preferences().edit().clear().commit()) call.resolve();
        else call.reject("无法清除连接配置。", "CONFIG_FAILED");
    }
    @PluginMethod public void request(PluginCall call) {
        // Capture one consistent pairing snapshot; changing configuration won't mix credentials mid-request.
        SharedPreferences p = preferences();
        final String server = p.getString("server", ""), token = p.getString("token", ""), pin = p.getString("fingerprint", "");
        if (server.isEmpty() || token.isEmpty() || pin.isEmpty()) { call.reject("请先在设置里粘贴电脑的连接配置。", "NOT_PAIRED"); return; }
        final String path = call.getString("path", ""), method = call.getString("method", "GET");
        if (!("/health".equals(path) || path.startsWith("/api/")) || path.contains("\r") || path.contains("\n") || !(method.equals("GET") || method.equals("POST"))) {
            call.reject("请求格式不正确。", "INVALID_REQUEST"); return;
        }
        final String body = call.getString("body", "");
        final int timeout = Math.max(1000, Math.min(70000, call.getInt("timeout", 8000)));
        executor.execute(() -> {
            HttpsURLConnection connection = null;
            try {
                URL url = new URL(server + path);
                connection = (HttpsURLConnection) url.openConnection();
                connection.setSSLSocketFactory(LanSecurity.sockets(pin));
                // Keep the platform hostname verifier; the paired cert must also match the requested IP.
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(Math.min(timeout, 8000)); connection.setReadTimeout(timeout);
                connection.setRequestMethod(method);
                connection.setRequestProperty("Authorization", "Bearer " + token);
                connection.setRequestProperty("Content-Type", "application/json");
                if (method.equals("POST")) {
                    byte[] data = body.getBytes(StandardCharsets.UTF_8);
                    if (data.length > 16384) throw new IllegalArgumentException();
                    connection.setDoOutput(true);
                    try (java.io.OutputStream out = connection.getOutputStream()) { out.write(data); }
                }
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) { call.reject("连接地址发生跳转，请核对电脑配置。", "REDIRECT_BLOCKED"); return; }
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (stream == null) throw new IllegalStateException();
                String content;
                try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] bytes = new byte[8192]; int count;
                    while ((count = in.read(bytes)) != -1) { if (out.size() + count > 2 * 1024 * 1024) throw new IllegalStateException(); out.write(bytes, 0, count); }
                    content = out.toString("UTF-8");
                }
                JSObject result = new JSObject(); result.put("status", status); result.put("data", new JSONObject(content)); call.resolve(result);
            } catch (SSLException error) { call.reject("电脑证书验证失败，请核对时间，或重新粘贴电脑当前生成的配置。", "TLS_VERIFICATION_FAILED"); }
            catch (SocketTimeoutException error) { call.reject("连接超时，请检查同一 Wi-Fi、电脑服务和防火墙。若刚发送过消息，请先检查记录。", "CONNECTION_TIMEOUT"); }
            catch (Exception error) { call.reject("无法连接电脑，请检查 Wi-Fi、电脑服务、地址和防火墙。", "CONNECTION_FAILED"); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }
    @Override protected void handleOnDestroy() { executor.shutdown(); }
}
