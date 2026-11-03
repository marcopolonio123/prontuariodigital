package br.mydoctor;

import com.machinezoo.sourceafis.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Private stdin/stdout protocol. No socket, image files, subjects or logs. */
public final class FingerprintWorker {
  public static void main(String[] args) throws Exception {
    var reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    var writer = new PrintWriter(System.out, true, StandardCharsets.UTF_8);
    writer.println("ready\tSourceAFIS-3.18.1");
    for (String line; (line = reader.readLine()) != null;) {
      try {
        if (line.length() > 12000000) throw new IllegalArgumentException();
        var p = line.split("\t", -1);
        if (p[0].equals("extract") && p.length == 3) {
          double dpi = Double.parseDouble(p[1]);
          if (!Double.isFinite(dpi) || dpi < 72 || dpi > 2000) throw new IllegalArgumentException();
          var image = new FingerprintImage(Base64.getDecoder().decode(p[2]), new FingerprintImageOptions().dpi(dpi));
          writer.println("ok\t" + Base64.getEncoder().encodeToString(new FingerprintTemplate(image).toByteArray()));
        } else if (p[0].equals("match") && p.length == 3) {
          var probe = new FingerprintTemplate(Base64.getDecoder().decode(p[1]));
          var candidate = new FingerprintTemplate(Base64.getDecoder().decode(p[2]));
          writer.println("ok\t" + new FingerprintMatcher(probe).match(candidate));
        } else writer.println("error\tinvalid_request");
      } catch (Exception error) { writer.println("error\tprocessing_failed"); }
    }
  }
}
