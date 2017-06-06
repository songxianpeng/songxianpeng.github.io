---  
lajout: post  
title: Luence和Solr  
tags: Luence Solr  
categories: JavaEE  
published: true  
---  

## 信息检索与全文检索

信息检索是从信息集合中找出与用户需求相关的信息，包括文本、图像、视频、音频等多媒体信息

* 全文检索：把用户的查询需求和全文中的每一个分词进行比较，不考虑查询请求与文本语义上的匹配，最具通用性和实用性
* 数据检索：查询要求和信息系统中的数据遵循一定的格式，具有一定的结构，允许特定的字段检索，其性能与使用有很大的局限性，支持语义匹配的能力也很差
* 知识检索：强调基于知识的、语义上的匹配

### 全文索引

#### 建立索引

* 信息采集：把信息源的信息拷贝到本地，构成待检索的信息集合
* 信息加工；为爱刺激到本地的信息编排索引，为查询做好准备

![index](/static/img/Lucene/index.png "index")

#### 分词器

* 文本在建立索引和搜索时都会先分词

![keyAnalyzer](/static/img/Lucene/keyAnalyzer.png "keyAnalyzer")

#### 索引结构

* 索引文件结构是倒排索引，索引对象是文档中的单词，用来存储这些单词在文档中的位置
* 索引库时一组文本的集合，索引库位置Directory
* 文档Document是Filed的集合，Field的值是文本

![Directory](/static/img/Lucene/Directory.png "Directory")

## Luence




------

*以上资源总结于传值博客Luence教程*