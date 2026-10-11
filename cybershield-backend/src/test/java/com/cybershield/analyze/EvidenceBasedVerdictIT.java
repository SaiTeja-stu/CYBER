package com.cybershield.analyze;

import com.cybershield.url.IpGuard;
import com.cybershield.url.UrlParts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class EvidenceBasedVerdictIT {

    @LocalServerPort
    int port;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private String base;
    private final IpGuard ipGuard = new IpGuard();

    @BeforeEach
    void setUp() {
        base = "http://localhost:" + port;
    }

    private String adminToken() throws Exception {
        String loginBody = "{\"login\":\"admin\",\"password\":\"admin-password-123456\"}";
        HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(loginBody))
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        return mapper.readTree(resp.body()).get("accessToken").asText();
    }

    private JsonNode postAnalyze(String type, String content) throws Exception {
        String token = adminToken();
        String body = mapper.writeValueAsString(mapper.createObjectNode()
                .put("type", type)
                .put("content", content));
        HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/api/v1/analyze"))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .header("X-Client", "test-suite")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        assertThat(resp.statusCode()).isEqualTo(200);
        return mapper.readTree(resp.body());
    }

    @Test
    void test1_official_site_hdfc_bank_in() throws Exception {
        JsonNode res = postAnalyze("URL", "https://hdfc.bank.in/personal-banking");

        assertThat(res.path("checkedHostname").asText()).isEqualTo("hdfc.bank.in");
        assertThat(res.path("registrableDomain").asText()).isEqualTo("hdfc.bank.in");
        assertThat(res.path("verdict").asText()).isEqualTo("NO_KNOWN_THREATS");
        assertThat(res.path("trusted").asBoolean()).isTrue();
        assertThat(res.path("findings").path("brandAuthenticity").path("status").asText()).isEqualTo("OFFICIAL");
        assertThat(res.path("checksRun").isArray()).isTrue();
        assertThat(res.path("checksRun").size()).isGreaterThan(0);
    }

    @Test
    void test2_known_official_google() throws Exception {
        JsonNode res = postAnalyze("URL", "https://www.google.com/search?q=security");

        assertThat(res.path("checkedHostname").asText()).isEqualTo("www.google.com");
        assertThat(res.path("registrableDomain").asText()).isEqualTo("google.com");
        assertThat(res.path("verdict").asText()).isEqualTo("NO_KNOWN_THREATS");
        assertThat(res.path("trusted").asBoolean()).isTrue();
    }

    @Test
    void test3_brand_lookalike_hdfc_verify() throws Exception {
        JsonNode res = postAnalyze("URL", "http://hdfc-verify-login.xyz/auth");

        assertThat(res.path("checkedHostname").asText()).isEqualTo("hdfc-verify-login.xyz");
        assertThat(res.path("registrableDomain").asText()).isEqualTo("hdfc-verify-login.xyz");
        assertThat(res.path("verdict").asText()).isEqualTo("FRAUD");
        assertThat(res.path("findings").path("brandAuthenticity").path("status").asText()).isEqualTo("LOOKALIKE");
    }

    @Test
    void test4_legitimate_domain_containing_brand_substring_pineapple() throws Exception {
        JsonNode res = postAnalyze("URL", "https://pineapple.com/recipes");

        assertThat(res.path("checkedHostname").asText()).isEqualTo("pineapple.com");
        assertThat(res.path("registrableDomain").asText()).isEqualTo("pineapple.com");
        // Must NOT be falsely accused of Apple impersonation / FRAUD
        assertThat(res.path("verdict").asText()).isNotEqualTo("FRAUD");
        assertThat(res.path("findings").path("brandAuthenticity").path("status").asText()).isNotEqualTo("LOOKALIKE");
    }

    @Test
    void test5_streaming_piracy_without_confirmed_malware_evidence() throws Exception {
        JsonNode res = postAnalyze("URL", "https://net77.cc/watch/movie-1234");

        assertThat(res.path("findings").path("contentAdvisory").path("status").asText()).isEqualTo("STREAMING_PIRACY");
        // Content advisory must not blindly label site as MALICIOUS technical threat
        assertThat(res.path("findings").path("technicalThreat").path("status").asText()).isNotEqualTo("MALICIOUS");
    }

    @Test
    void test6_ssrf_and_private_addresses_blocked() throws Exception {
        assertThat(ipGuard.isBlocked(InetAddress.getByName("127.0.0.1"))).isTrue();
        assertThat(ipGuard.isBlocked(InetAddress.getByName("169.254.169.254"))).isTrue();
        assertThat(ipGuard.isBlocked(InetAddress.getByName("10.0.0.1"))).isTrue();
        assertThat(ipGuard.isBlocked(InetAddress.getByName("192.168.1.1"))).isTrue();
        assertThat(ipGuard.isMetadataHostname("169.254.169.254")).isTrue();
        assertThat(ipGuard.isMetadataHostname("metadata.google.internal")).isTrue();
    }

    @Test
    void test7_domain_parsing_subdomains_punycode_and_ccslds() throws Exception {
        // Multi-part ccSLDs
        assertThat(UrlParts.parse("http://netbanking.hdfcbank.com").get().registrableDomain()).isEqualTo("hdfcbank.com");
        assertThat(UrlParts.parse("http://my.hdfc.bank.in").get().registrableDomain()).isEqualTo("hdfc.bank.in");
        assertThat(UrlParts.parse("http://my.hdfc.bank.in").get().domainLabel()).isEqualTo("hdfc");
        assertThat(UrlParts.parse("http://portal.sbi.co.in").get().registrableDomain()).isEqualTo("sbi.co.in");
        assertThat(UrlParts.parse("http://portal.sbi.co.in").get().domainLabel()).isEqualTo("sbi");
        assertThat(UrlParts.parse("http://news.bbc.co.uk").get().registrableDomain()).isEqualTo("bbc.co.uk");
        assertThat(UrlParts.parse("http://news.bbc.co.uk").get().domainLabel()).isEqualTo("bbc");

        // Punycode / IDN
        assertThat(UrlParts.parse("http://xn--pple-43d.com").get().isPunycode()).isTrue();
        assertThat(UrlParts.parse("http://google.com").get().isPunycode()).isFalse();

        // Deceptive subdomain
        JsonNode subRes = postAnalyze("URL", "http://hdfc.bank.in.attacker-host.com/login");
        assertThat(subRes.path("registrableDomain").asText()).isEqualTo("attacker-host.com");
        assertThat(subRes.path("findings").path("brandAuthenticity").path("status").asText()).isEqualTo("DECEPTIVE_SUBDOMAIN");
        assertThat(subRes.path("verdict").asText()).isEqualTo("FRAUD");
    }
}
