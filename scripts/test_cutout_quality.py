import io,unittest
from PIL import Image,ImageDraw
from cutout_quality import inspect_cutout,meaningful_head_extension
def photo(head=True):
    original=Image.new('RGB',(300,400),'white')
    cut=Image.new('RGBA',(300,400),(0,0,0,0))
    d=ImageDraw.Draw(cut)
    if head:d.ellipse((95,55,190,151),fill='tan')
    d.polygon([(80,155),(215,155),(240,360),(65,360)],fill='blue')
    out=io.BytesIO();original.save(out,'PNG');source=out.getvalue()
    out=io.BytesIO();cut.save(out,'PNG');return source,out.getvalue()
class TestCutout(unittest.TestCase):
    def test_complete(self):
        a,b=photo()
        self.assertTrue(inspect_cutout(a,b,detect_faces=lambda _: [(110,70,55,55)]).ok)
    def test_headless(self):
        a,b=photo(False)
        self.assertEqual(inspect_cutout(a,b,detect_faces=lambda _: [(110,70,55,55)]).reason,'source_face_missing_in_cutout')
    def test_repair_evidence(self):
        a,good=photo();_,bad=photo(False)
        self.assertTrue(meaningful_head_extension(a,bad,good))
        self.assertFalse(meaningful_head_extension(a,bad,bad))
if __name__=='__main__':unittest.main()
