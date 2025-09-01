module.exports = function timing(thresholdMs){
  const th = typeof thresholdMs==='number' ? thresholdMs : 400;
  return async function(req,res,next){
    const t0 = Date.now();
    const end = res.end;
    res.end = function(chunk, encoding){
      const dt = Date.now() - t0;
      if (dt > th){
        try{ console.log("[slow]", req.method, req.url, dt+"ms"); }catch(e){}
      }
      end.apply(this, arguments);
    };
    next();
  };
};