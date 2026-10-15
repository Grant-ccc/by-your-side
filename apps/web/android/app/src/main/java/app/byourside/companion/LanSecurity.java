package app.byourside.companion;

import java.net.URI;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/** Per-connection trust for an out-of-band paired certificate; never a trust-all manager. */
public final class LanSecurity {
    private LanSecurity() {}
    public static String server(String value) throws Exception {
        URI uri = new URI(value);
        if (!"https".equals(uri.getScheme()) || !privateIpv4(uri.getHost()) || uri.getPort() < 1024 || uri.getPort() > 65535
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) throw new IllegalArgumentException("Invalid server");
        return "https://" + uri.getHost() + ":" + uri.getPort();
    }
    static boolean privateIpv4(String host) {
        if (host == null) return false;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] n = new int[4];
        try {
            for (int i = 0; i < 4; i++) {
                if (!parts[i].matches("0|[1-9][0-9]{0,2}")) return false;
                n[i] = Integer.parseInt(parts[i]); if (n[i] > 255) return false;
            }
        } catch (NumberFormatException error) { return false; }
        return n[0] == 10 || (n[0] == 172 && n[1] >= 16 && n[1] <= 31) || (n[0] == 192 && n[1] == 168);
    }
    public static String fingerprint(String value) {
        String clean = value.replace(":", "").toLowerCase(java.util.Locale.ROOT);
        if (!clean.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("Invalid fingerprint");
        return clean;
    }
    static boolean matches(byte[] encoded, String expected) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(encoded);
        byte[] wanted = new byte[32];
        for (int i = 0; i < 32; i++) wanted[i] = (byte) Integer.parseInt(expected.substring(i * 2, i * 2 + 2), 16);
        return MessageDigest.isEqual(digest, wanted);
    }
    public static SSLSocketFactory sockets(String fingerprint) throws Exception {
        final String expected = fingerprint(fingerprint);
        X509TrustManager trust = new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] chain, String type) throws CertificateException { throw new CertificateException("Client certificates unsupported"); }
            public void checkServerTrusted(X509Certificate[] chain, String type) throws CertificateException {
                try {
                    if (chain == null || chain.length == 0 || !matches(chain[0].getEncoded(), expected)) throw new CertificateException("Pinned certificate mismatch");
                    chain[0].checkValidity();
                } catch (CertificateException error) { throw error; }
                catch (Exception error) { throw new CertificateException("Certificate verification failed"); }
            }
        };
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[]{trust}, null);
        return context.getSocketFactory();
    }
}
