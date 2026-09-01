// 种子脚本：创建 6 个角色账号（不含演示数据）
// 样品测试数据请用: node seed-samples.js
// 治具测试数据请用: node seed-fixture.js
// 用法: node seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const D = require('./db');

async function seed() {
  await D.init();

  const { createUser, getUserByUsername, createSample, addLog, listUsers } = D;

  const users = [
    { username: 'admin',   password: 'admin123', role: 'ADMIN',  dept: '系统',     display_name: '系统管理员' },
    { username: 'rd01',    password: 'rd123',    role: 'RD',    dept: '研发部', display_name: '研发工程师' },
    { username: 'qa01',    password: 'qa123',    role: 'QA',     dept: '品保文管中心', display_name: '品保文管员' },
    { username: 'mfg01',   password: 'mfg123',   role: 'CUSTODY', dept: '制造部',  display_name: '制造部保管员' },
    { username: 'fqc01',   password: 'fqc123',   role: 'CUSTODY', dept: 'FQC',     display_name: 'FQC保管员' },
    { username: 'pmc01',   password: 'pmc123',   role: 'CUSTODY', dept: '生管部',  display_name: '生管员' },
    { username: 'wh01',    password: 'wh123',    role: 'CUSTODY', dept: '资材部',  display_name: '仓库保管员' },
    { username: 'me01',    password: 'me123',    role: 'ME',     dept: '生技部',   display_name: '生技工程师' },
  ];

  for (const u of users) {
    if (!await getUserByUsername(u.username)) {
      await createUser({
        username: u.username, password_hash: bcrypt.hashSync(u.password, 10),
        role: u.role, dept: u.dept, display_name: u.display_name
      });
      console.log(`  创建账号: ${u.username} (${u.role} / ${u.dept})`);
    } else {
      console.log(`  已存在跳过: ${u.username}`);
    }
  }

  const cnt = (await D.listSamples({})).length;
  if (cnt === 0) {
    const admin = await getUserByUsername('admin');
    const s = await createSample({ name: '演示样品-A', spec: '规格: 见附件', notes: '种子演示样品', created_by: admin.id });
    await addLog({ sample_id: s.id, action: 'CREATE', role: 'ADMIN', user_id: admin.id, dept: '系统', note: '种子初始化' });
    console.log(`  创建演示样品: ${s.sample_no}`);
  } else {
    console.log('  样品已存在，跳过演示样品创建');
  }

  console.log('\n当前账号列表:');
  for (const u of await listUsers()) console.log(`  ${u.username}\t${u.role}\t${u.dept}`);
  console.log('\n种子完成。默认密码见上方账号列表对应项。');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
