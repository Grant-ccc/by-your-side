package app.byourside.companion;
import static org.junit.Assert.*;
import org.junit.Test;
import java.nio.charset.StandardCharsets;
public class LanSecurityTest {
    @Test public void restrictsPairingToPrivateHttpsAddresses() throws Exception {
        assertEquals("https://192.168.1.2:17402", LanSecurity.server("https://192.168.1.2:17402/"));
        for (String value : new String[]{"http://192.168.1.2:17402", "https://example.com:17402", "https://8.8.8.8:17402", "https://192.168.1.2:17402/path", "https://user@192.168.1.2:17402", "https://192.168.1.2:17402?token=x", "https://127.0.0.1:17402", "https://192.168.001.2:17402"}) {
            try { LanSecurity.server(value); fail("Must reject " + value); } catch (IllegalArgumentException expected) {}
        }
    }
    @Test public void pinsExactlyThePairedCertificateDigest() throws Exception {
        String sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assertTrue(LanSecurity.matches("abc".getBytes(StandardCharsets.UTF_8), sha));
        assertFalse(LanSecurity.matches("def".getBytes(StandardCharsets.UTF_8), sha));
        try { LanSecurity.fingerprint("not-a-pin"); fail("Must reject invalid pin"); } catch (IllegalArgumentException expected) {}
    }
}
