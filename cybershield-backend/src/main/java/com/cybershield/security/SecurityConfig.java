package com.cybershield.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;
import java.util.Map;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final ObjectMapper objectMapper;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter, ObjectMapper objectMapper) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.objectMapper = objectMapper;
    }

    /**
     * Delegating encoder (bcrypt default, {id}-prefixed hashes). Never
     * MD5/SHA/plaintext. Upgrade path: switch the default to {@code argon2}
     * by adding BouncyCastle and an Argon2PasswordEncoder here.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())                       // stateless API, no cookies
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .headers(h -> h
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"))
                .frameOptions(f -> f.deny())
                .referrerPolicy(r -> r.policy(
                        org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000))
                .addHeaderWriter((req, res) -> {
                    res.setHeader("X-Content-Type-Options", "nosniff");
                    res.setHeader("Cache-Control", "no-store");
                }))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/auth/me").authenticated()
                .requestMatchers("/api/v1/investigate/**").hasRole("INVESTIGATOR")
                .requestMatchers("/api/v1/admin/investigators/**").hasRole("ADMIN")
                .requestMatchers("/auth/**",
                                 "/api/v1/education/**",
                                 "/api/v1/forensics/**",
                                 "/actuator/health",
                                 "/v3/api-docs/**",
                                 "/swagger-ui/**",
                                 "/swagger-ui.html").permitAll()
                // Static dashboard & forensic console
                .requestMatchers(HttpMethod.GET,
                                 "/", "/index.html", "/favicon.ico", "/favicon.svg",
                                 "/assets/**", "/dashboard/**", "/vite.svg", "/logo.jpg", "/logo.png",
                                 "/investigate.html", "/forensics.html").permitAll()
                .requestMatchers("/api/v1/admin/**", "/api/v1/stats/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/**").authenticated()
                .requestMatchers("/api/analyze-url", "/api/url-scans", "/api/analyze-email").authenticated()
                .anyRequest().denyAll())
            .exceptionHandling(e -> e
                .authenticationEntryPoint((req, res, ex) -> writeProblem(res, 401, "Unauthorized",
                        "Authentication is required to access this resource."))
                .accessDeniedHandler((req, res, ex) -> writeProblem(res, 403, "Forbidden",
                        "You do not have permission to perform this action.")))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private void writeProblem(HttpServletResponse res, int status, String title, String detail) {
        try {
            res.setStatus(status);
            res.setContentType("application/problem+json");
            res.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
            objectMapper.writeValue(res.getWriter(), Map.of(
                    "type", "about:blank",
                    "title", title,
                    "status", status,
                    "detail", detail));
        } catch (Exception ignored) {
            // response already committed
        }
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration c = new CorsConfiguration();
        // Chrome extensions send an Origin like chrome-extension://<id>; the Android
        // app sends none. Tighten this to specific extension IDs in production.
        c.setAllowedOriginPatterns(List.of(
                "chrome-extension://*",
                "http://localhost:*", "https://localhost:*",
                "http://127.0.0.1:*"));
        c.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        c.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Client", "Accept"));
        c.setMaxAge(3600L);
        var src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/**", c);
        return src;
    }
}
