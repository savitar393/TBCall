import java.net.*;
import java.util.*;
public class NetworkProbe {
  static boolean tcp(String label,String host) {
    return tcp(label,host,8081);
  }
  static boolean tcp(String label,String host,int port) {
    try(Socket s=new Socket()) { s.connect(new InetSocketAddress(host,port),1500); System.out.println(label+"=CONNECTED"); return true; }
    catch(Exception e) { System.out.println(label+"=BLOCKED_OR_FAILED type="+e.getClass().getSimpleName()); return false; }
  }
  static boolean udp(String label,String host,int port) {
    try(DatagramSocket s=new DatagramSocket()) {
      s.setSoTimeout(1500); s.connect(InetAddress.getByName(host),port);
      byte[] b=port==53 ? new byte[]{0x12,0x34,1,0,0,1,0,0,0,0,0,0,5,102,54,97,50,120,4,116,101,115,116,0,0,1,0,1} : "owned".getBytes();
      s.send(new DatagramPacket(b,b.length)); var p=new DatagramPacket(new byte[512],512); s.receive(p);
      System.out.println(label+"=REPLIED"); return true;
    } catch(Exception e) { System.out.println(label+"=BLOCKED_OR_FAILED type="+e.getClass().getSimpleName()); return false; }
  }
  public static void main(String[] a) throws Exception {
    boolean control=a[0].equals("control");
    int failures=0;
    if(!tcp("ALLOWED_TCP4",a[1])) failures++;
    if(!tcp("ALLOWED_TCP6",a[2])) failures++;
    if(!udp("ALLOWED_UDP4",a[1],8082)) failures++;
    if(!udp("ALLOWED_UDP6",a[2],8082)) failures++;
    if(tcp("OUTSIDE_TCP4",a[3])!=control) failures++;
    if(tcp("OUTSIDE_TCP6",a[4])!=control) failures++;
    if(udp("OUTSIDE_UDP4",a[3],8082)!=control) failures++;
    if(udp("OUTSIDE_UDP6",a[4],8082)!=control) failures++;
    if(udp("OUTSIDE_DIRECT_DNS4",a[3],53)!=control) failures++;
    if(udp("OUTSIDE_DIRECT_DNS6",a[4],53)!=control) failures++;
    if(tcp("OUTSIDE_DIRECT_DNS_TCP4",a[3],53)!=control) failures++;
    if(tcp("OUTSIDE_DIRECT_DNS_TCP6",a[4],53)!=control) failures++;
    boolean lookup=false;
    try { System.out.println("SYSTEM_DNS="+Arrays.toString(InetAddress.getAllByName("probe.tbcall.test"))); lookup=true; }
    catch(UnknownHostException e) { System.out.println("SYSTEM_DNS=FAILED type=UnknownHostException"); }
    if(lookup!=control) failures++;
    System.out.println("PROBE_MODE="+a[0]+" expectationFailures="+failures);
    System.exit(failures==0 ? 0 : 3);
  }
}
