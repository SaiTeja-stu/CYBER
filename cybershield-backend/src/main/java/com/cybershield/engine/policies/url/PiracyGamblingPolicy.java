package com.cybershield.engine.policies.url;

import com.cybershield.domain.Severity;
import com.cybershield.domain.Signal;
import com.cybershield.engine.AbstractPolicy;
import com.cybershield.engine.PolicyContext;
import com.cybershield.intel.LocalIntelStore;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * URL-14: pirated-movie / torrent sites, real-money betting sites and cracked-software sites.
 * These are illegal or high-harm, and are full of malicious ads, fake download buttons and payment fraud,
 * so they must never be rated "safe" just because no phishing signal fired.
 */
@Component
public class PiracyGamblingPolicy extends AbstractPolicy {

    private static final Pattern PIRACY_HOST = Pattern.compile(
            "(movierulz|tamilrockers|tamilmv|tamilyogi|isaimini|filmyzilla|filmywap|filmyhit|filmy4|9xmovies|9xflix"
            + "|moviesflix|vegamovies|hdhub4u|bolly4u|khatrimaza|mkvcinemas|worldfree4u|7starhd|jiorockers|ibomma"
            + "|kuttymovies|1337x|thepiratebay|piratebay|fmovies|soap2day|123movies|putlocker|tamilblasters|movies4u"
            + "|moviesda|klwap|desiremovies|mp4moviez|cinevood|skymovieshd|hindilinks4u|7movierulz|5movierulz|4movierulz"
            + "|moviezwap|jalshamoviez|okjatt|djpunjab|mp3juice|yts[.]mx|rarbg|nyaa[.]si|limetorrents|torrentz|kickass"
            + "|net77|netmirror)",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern PIRACY_NAME = Pattern.compile(
            "^(movies?|films?|filmy|bolly|holly|tamil|telugu|hindi|kannada|malayalam|mkv|hd|cine|cinema)[a-z0-9-]*"
            + "(4u|wap|zilla|rulz|hub|flix|mad|world|mkv|hd|junction|blasters|rockers|verse|zone|point|base|4k|hit|bazaar|mp4)[a-z0-9]*$",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern GAMBLING_HOST = Pattern.compile(
            "(satta|matka|teenpatti|rummy|dafabet|1xbet|parimatch|betway|bet365|fun88|mostbet|stake[.]com|betting|casino|lottery|jackpot)",
            Pattern.CASE_INSENSITIVE);

    private static final String[] PIRACY_TEXT = {
            "480p", "720p", "1080p", "300mb", "dual audio", "web-dl", "webrip", "hdrip", "camrip", "hdcam", "bluray",
            "torrent", "magnet:", "hindi dubbed", "free download", "download bollywood", "download hollywood"};
    private static final String[] GAMBLING_TEXT = {
            "real cash", "betting", "satta", "teen patti", "online casino", "rummy", "jackpot", "deposit bonus", "ipl betting"};
    private static final String[] CRACK_TEXT = {
            "crack", "keygen", "serial key", "full version free", "activator", "patch"};

    private final LocalIntelStore intel;

    public PiracyGamblingPolicy(LocalIntelStore intel) {
        super("URL-14", URL_LIKE);
        this.intel = intel;
    }

    @Override
    protected List<Signal> doEvaluate(PolicyContext ctx) {
        List<Signal> out = new ArrayList<>();
        boolean piracyFlagged = false;
        boolean gamblingFlagged = false;
        for (var u : ctx.allUrls()) {
            String host = u.host() == null ? "" : u.host().toLowerCase(Locale.ROOT);
            if (host.isEmpty() || intel.isAllowedDomain(host)) continue;
            String sld = sld(host);
            if (!piracyFlagged && (PIRACY_HOST.matcher(host).find() || PIRACY_NAME.matcher(sld).matches())) {
                out.add(signal("Piracy / illegal streaming site",
                        "'" + host + "' looks like a pirated-movie or torrent site. Illegal under the Copyright Act, and such "
                                + "sites are full of malicious ads, fake download buttons and drive-by installs.",
                        Severity.HIGH, 35));
                out.add(signal("Malicious ads and fake downloads",
                        "Piracy sites are a leading source of malware, fake 'Download' buttons and scam pop-ups.",
                        Severity.MEDIUM, 15));
                piracyFlagged = true;
            }
            if (!gamblingFlagged && GAMBLING_HOST.matcher(host).find()) {
                out.add(signal("Betting / gambling site",
                        "'" + host + "' looks like a real-money betting site. These are a common front for payment fraud "
                                + "and are banned in many states.",
                        Severity.HIGH, 35));
                out.add(signal("Payment-fraud risk",
                        "Betting sites often take deposits and then refuse withdrawals or steal card details.",
                        Severity.MEDIUM, 15));
                gamblingFlagged = true;
            }
        }

        // page text (WEBPAGE scans): catch sites we have never listed
        String page = ctx.rawContent() == null ? "" : ctx.rawContent().toLowerCase(Locale.ROOT);
        boolean trusted = ctx.primaryUrl().map(p -> intel.isAllowedDomain(p.host())).orElse(false);
        if (!page.isEmpty() && page.length() > 200 && !trusted) {
            if (!piracyFlagged && hits(page, PIRACY_TEXT) >= 3) {
                out.add(signal("Looks like a pirated-movie site",
                        "The page is full of pirated-release wording (480p / 720p / dual audio / web-dl / torrent).",
                        Severity.HIGH, 35));
                out.add(signal("Malicious ads and fake downloads",
                        "Piracy sites are a leading source of malware, fake 'Download' buttons and scam pop-ups.",
                        Severity.MEDIUM, 15));
            }
            if (!gamblingFlagged && hits(page, GAMBLING_TEXT) >= 2) {
                out.add(signal("Betting / gambling content",
                        "The page offers real-money betting or casino games.", Severity.MEDIUM, 20));
                out.add(signal("Payment-fraud risk",
                        "Betting sites often take deposits and then refuse withdrawals or steal card details.",
                        Severity.LOW, 8));
            }
            if (hits(page, CRACK_TEXT) >= 3) {
                out.add(signal("Cracked software / keygen site",
                        "Cracks and keygens very often carry malware and password stealers.", Severity.HIGH, 35));
                out.add(signal("Malware risk",
                        "Cracked installers are commonly bundled with trojans and information stealers.",
                        Severity.MEDIUM, 15));
            }
        }
        return out;
    }

    private static int hits(String text, String[] words) {
        int n = 0;
        for (String w : words) if (text.contains(w)) n++;
        return n;
    }

    /** Registrable-name label: "www.movierulzblog.com" -> "movierulzblog"; "x.co.in" -> "x". */
    private static String sld(String host) {
        String[] p = host.split("[.]");
        if (p.length <= 1) return host;
        int n = p.length;
        boolean cc = p[n - 1].length() == 2 && n >= 3 && java.util.Set.of("co", "com", "org", "net", "gov", "ac", "nic", "edu").contains(p[n - 2]);
        return cc ? p[n - 3] : p[n - 2];
    }
}
