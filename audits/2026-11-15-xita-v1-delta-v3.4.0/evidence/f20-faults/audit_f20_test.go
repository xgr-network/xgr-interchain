package runtime
import (
  "os"
  "path/filepath"
  "testing"
  "github.com/xgr-network/xgr-node/crypto"
  "github.com/xgr-network/xgr-node/types"
)
func TestAuditF20RestartAndWriteFailure(t *testing.T){
  a:=types.StringToAddress("0x1111111111111111111111111111111111111111")
  w:=&Worker{dataDir:t.TempDir(),localAddr:a,ilnLocalVotes:make(map[types.Hash]*ilnLocalVoteState)}
  old,next:=f20Vote(7,a),f20Vote(8,a)
  oldHash,nextHash:=crypto.Keccak256Hash(old.Payload),crypto.Keccak256Hash(next.Payload)
  if err:=w.persistILNLocalVote(oldHash,old);err!=nil{t.Fatal(err)}
  w.ilnLocalVotes[oldHash]=&ilnLocalVoteState{vote:old}
  tmp:=filepath.Join(w.ilnVoteDir(),nextHash.String()+".json.tmp")
  if err:=os.Mkdir(tmp,0700);err!=nil{t.Fatal(err)}
  if err:=w.persistILNLocalVote(nextHash,next);err==nil{t.Fatal("failure fixture unexpectedly wrote successor")}
  if w.hasDurableILNSuccessorVote(old,8){t.Fatal("failed write authorized retirement")}
  if _,err:=os.Stat(filepath.Join(w.ilnVoteDir(),oldHash.String()+".json"));err!=nil{t.Fatal("original evidence lost",err)}
  if err:=os.Remove(tmp);err!=nil{t.Fatal(err)}
  if err:=w.persistILNLocalVote(nextHash,next);err!=nil{t.Fatal(err)}
  restarted:=&Worker{dataDir:w.dataDir,localAddr:a,ilnLocalVotes:make(map[types.Hash]*ilnLocalVoteState)}
  if err:=restarted.recoverILNLocalVotes();err!=nil{t.Fatal(err)}
  if !restarted.hasDurableILNSuccessorVote(old,8){t.Fatal("valid journal successor unavailable after restart")}
  restarted.removeILNLocalVote(oldHash)
  if _,err:=os.Stat(filepath.Join(w.ilnVoteDir(),nextHash.String()+".json"));err!=nil{t.Fatal("retirement removed successor",err)}
}
