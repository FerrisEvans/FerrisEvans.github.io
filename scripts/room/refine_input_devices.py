"""A complete 101-key desktop keyboard and a corded two-button ball mouse.

Local coordinates face -Y; z=.685 is the desk surface. The parent places the
whole Computer_* assembly. Key pitch, stagger, and separate navigation/numpad
clusters share one scale, instead of filling a rectangle with arbitrary keys.
"""
import math
from mathutils import Vector
from refine_geometry import _box, _mesh, _tube
from refine_equipment import rounded_rect


def refine_input_devices(scene, ivory, keys, dark, ink, text):
    def mark(obj, profile='abs'):
        obj['hero_atlas'] = 'equipment'
        obj['surface_profile'] = profile
        return obj

    def box(name, p, size, material, radius=.002):
        return mark(_box(name, p, size, material, scene, bevel=radius, segments=4))

    def wire(name, points, radius):
        vertices, faces = _tube([Vector(p) for p in points], radius, 10)
        return mark(_mesh(name, vertices, faces, dark, scene, smooth=True))

    pitch = .038
    left = -23.25 * pitch / 2
    front, back = -.74, -.40
    slope = .075
    def deck(y):
        return .724 + (y - front) * slope

    # A low front lip and raised rear shell, with a real seam and rubber feet.
    keyboard = box('Computer_Keyboard', (0, -.57, .717), (.918, .34, .052), ivory, .007)
    for vertex in keyboard.data.vertices:
        if vertex.co.z > 0:
            vertex.co.z += (vertex.co.y + .17) * slope - .019
    box('Computer_Keyboard_Seam', (0, -.57, .705), (.9184, .3404, .0014), dark, .006)
    for x in (-.375, .375):
        for y in (-.697, -.437):
            box('Computer_KeyboardFoot', (x, y, .688), (.046, .028, .006), dark, .003)
    # Individual recessed wells leave visible moulded borders between clusters.
    for x, y, w, d in [
        (left + 7.5*pitch, -.577, 15*pitch+.012, .202),
        (left + 17.25*pitch, -.520, 3*pitch+.012, .088),
        (left + 17.25*pitch, -.634, 3*pitch+.012, .088),
        (left + 21.25*pitch, -.577, 4*pitch+.012, .202),
    ]:
        plate = box('Computer_Keyboard_Well', (x, y, deck(y)+.0005), (w, d, .002), dark, .004)
        plate.rotation_euler.x = math.atan(slope)

    count = 0
    def key(legend, unit_x, y, units=1, rows=1, modifier=False, small=False):
        nonlocal count
        width, depth = units*pitch-.004, rows*pitch-.004
        x = left + (unit_x+units/2)*pitch
        vertices, faces = [], []
        # The cap flares toward the switch skirt. Concentric top rings form a
        # shallow finger dish instead of the old flat cuboid/pyramid highlight.
        rings = [(.001, 1, .0025), (.016, .90, .0028), (.025, .84, .003)]
        for z, fraction, radius in rings:
            vertices.extend((a,b,z) for a,b in rounded_rect(width*fraction,depth*fraction,radius,steps=3))
        n = len(vertices)//len(rings)
        for layer in range(2):
            for i in range(n):
                j=(i+1)%n; a=layer*n; b=(layer+1)*n
                faces.append((a+i,a+j,b+j,b+i))
        faces.append(tuple(reversed(range(n))))
        last = 2*n
        for fraction in (.72,.54,.36,.18):
            start=len(vertices)
            vertices.extend((a,b,.025-.0012*(1-fraction*fraction)) for a,b in rounded_rect(width*.84*fraction,depth*.84*fraction,.003*fraction,steps=3))
            for i in range(n):
                j=(i+1)%n; faces.append((last+i,last+j,start+j,start+i))
            last=start
        center=len(vertices); vertices.append((0,0,.0238))
        for i in range(n): faces.append((last+i,last+(i+1)%n,center))
        cap=mark(_mesh('Computer_Key',vertices,faces,ivory if modifier else keys,scene,smooth=True))
        cap.location=(x,y,deck(y));cap.rotation_euler.x=math.atan(slope)
        if legend:
            size=.007 if small or len(legend)>3 else .009 if len(legend)>1 else .012
            text('Computer_Key_Print',legend,(-width*.31,-depth*.16,.0242),size,ink,cap,(0,0,0))
        count += 1
        return cap

    def row(y, entries):
        x=0
        for legend, width in entries:
            key(legend,x,y,width,modifier=width>1,small=len(legend)>3)
            x+=width
        assert abs(x-15)<1e-6, ('Keyboard row width',x)

    row(-.501, [(c,1) for c in '`1234567890-=']+[('Backspace',2)])
    row(-.539, [('Tab',1.5)]+[(c,1) for c in 'QWERTYUIOP[]']+[('\\',1.5)])
    row(-.577, [('Caps Lock',1.75)]+[(c,1) for c in "ASDFGHJKL;'"]+[('Enter',2.25)])
    row(-.615, [('Shift',2.25)]+[(c,1) for c in 'ZXCVBNM,./']+[('Shift',2.75)])
    # The 101-key layout predates Windows/Menu keys. Its bottom row has the
    # characteristic blank gaps beside Alt and a seven-unit space bar.
    for legend,x,width in [('Ctrl',0,1.5),('Alt',2.5,1.5),('',4,7),('Alt',11,1.5),('Ctrl',13.5,1.5)]:
        key(legend,x,-.653,width,modifier=True)
    key('Esc',0,-.437,modifier=True)
    for i in range(12):
        key('F'+str(i+1),2+i+(i//4)*.5,-.437,modifier=True,small=True)
    nav=15.75
    for i,legend in enumerate(('Print','Scroll','Pause')): key(legend,nav+i,-.437,modifier=True,small=True)
    for r,labels in enumerate((('Insert','Home','PgUp'),('Delete','End','PgDn'))):
        for c,legend in enumerate(labels):key(legend,nav+c,-.501-r*pitch,modifier=True,small=True)
    key('^',nav+1,-.615,modifier=True)
    for c,legend in enumerate(('<','v','>')):key(legend,nav+c,-.653,modifier=True)
    num=19.25
    for c,legend in enumerate(('Num','/','*','-')):key(legend,num+c,-.501,modifier=True)
    for r,labels in enumerate(('789','456','123')):
        for c,legend in enumerate(labels):key(legend,num+c,-.539-r*pitch)
    key('+',num+3,-.558,rows=2,modifier=True)
    key('Enter',num+3,-.634,rows=2,modifier=True,small=True)
    key('0',num,-.653,units=2)
    key('.',num+2,-.653)
    assert count == 101, ('Expected 101 keyboard keys',count)
    for i in range(3):
        box('Computer_Keyboard_LED', (left+(19.9+i*1.05)*pitch,-.439,deck(-.439)+.002),(.009,.004,.002),dark,.001)
    wire('Computer_KeyboardCable',[(.22,-.398,.731),(.23,-.382,.722),(.34,-.382,.708),(.47,-.375,.700),(.49,-.15,.700),(.49,.23,.710),(.45,.405,.725),(.26,.405,.760),(.26,.376,.760)],.003)

    # Rounded palm shell with a low nose, curved flanks and flat underside.
    # Mouse front is +Y (toward the display), so the cable exits that end.
    mx,my=.58,-.59
    stations=[(-.110,.014,.018),(-.099,.040,.036),(-.077,.055,.058),
              (-.042,.060,.072),(-.005,.059,.070),(.030,.057,.061),
              (.064,.054,.048),(.094,.049,.034),(.110,.036,.023)]
    vertices,faces=[],[]; n=24
    for y,half,high in stations:
        # Upper half ellipse plus a flattened lower return make a solid shell,
        # not an ellipsoid hovering above a separate rectangular footprint.
        for i in range(n):
            a=math.tau*i/n
            z=.694+(high*math.sin(a) if math.sin(a)>0 else .003*math.sin(a))
            vertices.append((mx+half*math.cos(a),my+y,z))
    for r in range(len(stations)-1):
        for i in range(n):
            j=(i+1)%n; a=r*n;b=(r+1)*n
            faces.append((a+i,b+i,b+j,a+j))
    faces += [tuple(range(n)),tuple(reversed(range((len(stations)-1)*n,len(vertices))))]
    mouse=mark(_mesh('Computer_Mouse',vertices,faces,ivory,scene,smooth=True))
    box('Computer_Mouse_Sole',(mx,my,.690),(.083,.164,.006),dark,.025)
    for y in (-.073,.069):box('Computer_Mouse_Foot',(mx,my+y,.6865),(.065,.019,.003),dark,.006)

    def upper(y,x):
        for (ay,aw,ah),(by,bw,bh) in zip(stations,stations[1:]):
            if ay<=y<=by:
                f=(y-ay)/(by-ay); half=aw+(bw-aw)*f; height=ah+(bh-ah)*f
                return .694+height*math.sqrt(max(0,1-(x/half)**2))
        raise ValueError(y)

    # Each button follows the dome. The cap is a separate shallow closed mesh,
    # separated from its neighbour and palm shell by a narrow dark parting gap.
    for side in (-1,1):
        vv,ff=[],[]; nx,ny=7,10
        for layer in (0,1):
            for r in range(ny+1):
                y=.018+r*.080/ny
                for c in range(nx+1):
                    x=side*(.0011+c*.043/nx)
                    vv.append((mx+x,my+y,upper(y,x)+(.0009 if layer else -.0011)))
        stride=nx+1; layer_size=stride*(ny+1)
        for r in range(ny):
            for c in range(nx):
                a=r*stride+c
                top=(a+layer_size,a+1+layer_size,a+stride+1+layer_size,a+stride+layer_size)
                ff.append(top if side>0 else tuple(reversed(top)))
                bottom=(a,a+stride,a+stride+1,a+1)
                ff.append(bottom if side>0 else tuple(reversed(bottom)))
        boundary=list(range(stride))+[r*stride+nx for r in range(1,ny+1)]+[ny*stride+c for c in range(nx-1,-1,-1)]+[r*stride for r in range(ny-1,0,-1)]
        for i,a in enumerate(boundary):
            b=boundary[(i+1)%len(boundary)]
            f=(a,b,b+layer_size,a+layer_size)
            ff.append(f if side>0 else tuple(reversed(f)))
        mark(_mesh('Computer_Mouse_Button',vv,ff,keys,scene,smooth=True))
    wire('Computer_Mouse_ButtonSplit',[(mx,my+y,upper(y,0)+.001)for y in (.017,.033,.050,.067,.084,.099)],.00065)
    wire('Computer_Mouse_ButtonHinge',[(mx+x,my+.017,upper(.017,x)+.0005)for x in (-.044,-.033,-.022,-.011,0,.011,.022,.033,.044)],.0006)
    wire('Computer_MouseCable',[(mx,my+.109,.710),(mx,my+.135,.705),(.57,-.35,.696),(.54,-.12,.696),(.54,.23,.710),(.51,.435,.730),(.34,.435,.760),(.34,.376,.760)],.0024)
    # Rear connectors terminate the cords outside the steel chassis.
    for x in (.26,.34):
        box('Computer_RearPort',(x,.373,.760),(.031,.008,.028),dark,.004)
        box('Computer_CablePlug',(x,.387,.760),(.018,.026,.019),dark,.004)
    return {'keyboard':keyboard,'mouse':mouse,'keyCount':count,
            'keyboardSize':[.918,.34],'mouseSize':[.12,.22,.075],
            'keyPitch':pitch,'layout':'101-key ANSI, no Windows keys'}
