import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate, defaults} from '../dist/calculate.mjs';

test('API schema retains every calculator setting',()=>{
 assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../settings-schema.json',import.meta.url))),defaults);
});
test('hybrid retains independent motion rates and capture settings for timelapse',()=>{
 const s={...defaults,setup:'hybrid',mode:'both',linked:false,photoRate:3,videoRate:7,lapseUsesCaptureSettings:true};
 const r=calculate(s);
 assert.equal(r.motionPhotos,216);
 assert.equal(r.motionVideos,168);
 assert.equal(r.lapsePhotos,432);
 assert.equal(r.lapseVideos,144);
 assert.equal(r.photos,648);
 assert.equal(r.videos,312);
 assert.equal(r.daily,9355.2);
 assert.equal(r.days,64000/r.daily);
});
test('normal timelapse uses one photo per interval independently of motion capture mode',()=>{
 const r=calculate({...defaults,setup:'lapse',mode:'video'});
 assert.equal(r.photos,144);
 assert.equal(r.videos,0);
 assert.equal(r.daily,345.59999999999997);
});
