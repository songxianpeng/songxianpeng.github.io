---
layout: post
title: ZooKeeper
tags: ZooKeeper
categories: JavaEE
published: true
---

相对于开发在一台计算机上运行的单个程序，如何让一个应用中多个独立的程序协同工作是一件非常困难的事情。

* 开发这样的应用，很容易让很多开发人员陷入如何使多个程序协同工作的逻辑中，最后导致没有时间更好地思考和实现他们自己的应用程序逻辑；
* 又或者开发人员对协同逻辑关注不够，只是用很少的时间开发了一个简单脆弱的主协调器，导致不可靠的单一失效点。

ZooKeeper的设计保证了其健壮性，这就使得应用开发人员可以更多关注应用本身的逻辑，而不是协同工作上。

* ZooKeeper从文件系统API得到启发，提供一组简单的API，使得开发人员可以实现通用的协作任务，包括选举主节点、管理组内成员关系、管理元数据等。
* ZooKeeper包括一个应用开发库（主要提供Java和C两种语言的API）和一个用Java实现的服务组件。
* ZooKeeper的服务组件运行在一组专用服务器之上，保证了高容错性和可扩展性。

当你决定使用ZooKeeper来设计应用时，最好将应用数据和协同数据独立开。

## ZooKeeper的概念和基础

### ZooKeeper的使命

关于ZooKeeper这样的系统功能的讨论都围绕着一条主线：它可以在分布式系统中协作多个任务。一个协作任务是指一个包含多个进程的任务。这个任务可以是为了协作或者是为了管理竞争。

* 协作意味着多个进程需要一同处理某些事情，一些进程采取某些行动使得其他进程可以继续工作。
	* 在典型的主-从（master-worker）工作模式中，从节点处于空闲状态时会通知主节点可以接受工作，于是主节点就会分配任务给从节点。
* 竞争则不同。它指的是两个进程不能同时处理工作的情况，一个进程必须等待另一个进程。
	* 在主-从工作模式中，很多进程都想成为主节点，因此需要实现互斥排他锁（mutual exclusion）。
* 协同并不总是采取像群首选举或者加锁等同步原语的形式。配置元数据也是一个进程通知其他进程需要做什么的一种常用方式。
	* 在一个主-从系统中，从节点需要知道任务已经分配到它们。即使在主节点发生崩溃的情况下，这些信息也需要有效。

虽然许多消息传递算法可以实现同步原语，但是使用一个提供某种有序共享存储的组件往往更加简便，这正是ZooKeeper所采用的方式。

Zookeep的客户端API功能强大，其中包括：

* 保障强一致性、有序性和持久性。
* 实现通用的同步原语的能力。
* 在实际分布式系统中，并发往往导致不正确的行为。ZooKeeper提供了一种简单的并发处理机制。

#### 通过ZooKeeper构建分布式系统

本文内容对分布式系统的定义为：分布式系统是同时跨越多个物理主机，独立运行的多个软件组件所组成的系统。

使用一个独立的协调组件有几个重要的好处：

* 首先，可以独立地设计和实现该组件，这样独立的组件可以跨多个应用共享。
* 其次，系统架构师可以简化协作方面的工作。
* 最后，系统可以独立地运行和协作这些组件，独立这样的组件，也简化了生产环境中解决实际问题的任务。

分布式系统中的进程通信有两种选择：

直接通过网络进行信息交换，或读写某些共享存储。

ZooKeeper使用共享存储模型来实现应用间的协作和同步原语。对于共享存储本身，又需要在进程和存储间进行网络通信。

在真实的系统中，需要特别注意以下问题：

* 消息延迟
	* 消息传输可能会发生任意延迟，比如，因为网络拥堵。这种任意延迟可能会导致不可预期的后果。
	* 比如，根据基准时钟，进程P先发送了一个消息，之后另一个进程Q发送了消息，但是进程Q的消息也许会先完成传送。
* 处理器性能
	* 操作系统的调度和超载也可能导致消息处理的任意延迟。
	* 当一个进程向另一个进程发送消息时，整个消息的延时时间约等于发送端消耗的时间、传输时间、接收端的处理时间的总和。如果发送或接收过程需要调度时间进行处理，消息延时会更高。
* 时钟偏移
	* 使用时间概念的系统并不少见，比如，确定某一时间系统中发生了哪些事件。处理器时钟并不可靠，它们之间也会发生任意的偏移。因此，依赖处理器时钟也许会导致错误的决策。

关于这些问题的一个重要结果是，在实际情况中，很难判断一个进程是崩溃了还是某些因素导致了延时。
没有收到一个进程发送的消息，可能是该进程已经崩溃，或是最新消息发生了网络延迟，或是其他情况导致进程延迟，或者是进程时钟发生了偏移。
无法确定一个被称为异步（asynchronous）的系统中的这些区别。

ZooKeeper的精确设计简化了这些问题的处理，ZooKeeper并不是完全消除这些问题，而是将这些问题在应用服务层面上完全透明化，使得这些问题更容易处理。
ZooKeeper实现了重要的分布式计算问题的解决方案，直观为开发人员提供某种程度上实现的封装。

### 主-从应用

要实现主-从模式的系统，必须解决以下三个关键问题：

* 主节点崩溃
	* 如果主节点发送错误并失效，系统将无法分配新的任务或重新分配已失败的任务。
* 从节点崩溃
	* 如果从节点崩溃，已分配的任务将无法完成。
* 通信故障
	* 如果主节点和从节点之间无法进行信息交换，从节点将无法得知新任务分配给它。

为了处理这些问题，之前的主节点出现问题时，系统需要可靠地选举一个新的主节点，判断哪些从节点有效，并判定一个从节点的状态相对于系统其他部分是否失效。

#### 主节点失效

主节点失效时，需要有一个备份主节点（backup master）。
当主要主节点（primary master）崩溃时，备份主节点接管主要主节点的角色，进行故障转移，然而，这并不是简单开始处理进入主节点的请求。
新的主要主节点需要能够恢复到旧的主要主节点崩溃时的状态。对于主节点状态的可恢复性，不能依靠从已经崩溃的主节点来获取这些信息，需要通过ZooKeeper来获取。

假如主节点有效，备份主节点却认为主节点已经崩溃。

这种错误的假设可能发生在以下情况:

例如主节点负载很高，导致消息任意延迟，备份主节点将会接管成为主节点的角色，执行所有必需的程序，最终可能以主节点的角色开始执行，成为第二个主要主节点。
更糟的是，如果一些从节点无法与主要主节点通信，如由于网络分区（network partition）错误导致，这些从节点可能会停止与主要主节点的通信，而与第二个主要主节点建立主-从关系。

针对这个场景中导致的问题，一般称之为脑裂（split-brain）：系统中两个或者多个部分开始独立工作，导致整体行为不一致性。

需要找出一种方法来处理主节点失效的情况，关键是需要避免发生脑裂的情况。

#### 从节点失效

客户端向主节点提交任务，之后主节点将任务派发到有效的从节点中。从节点接收到派发的任务，执行完这些任务后会向主节点报告执行状态。主节点下一步会将执行结果通知给客户端。

如果从节点崩溃了，所有已派发给这个从节点且尚未完成的任务需要重新派发。其中首要需求是让主节点具有检测从节点的崩溃的能力。
主节点必须能够检测到从节点的崩溃，并确定哪些从节点是否有效以便派发崩溃节点的任务。

一个从节点崩溃时，从节点也许执行了部分任务，也许全部执行完，但没有报告结果。如果整个运算过程产生了其他作用，还有必要执行某些恢复过程来清除之前的状态。

#### 通信故障

如果一个从节点与主节点的网络连接断开，比如网络分区（network partition）导致，重新分配一个任务可能会导致两个从节点执行相同的任务。

如果一个任务允许多次执行，在进行任务再分配时可以不用验证第一个从节点是否完成了该任务。如果一个任务不允许，那么的应用需要适应多个从节点执行相同任务的可能性。

通信故障导致的另一个重要问题是对锁等同步原语的影响。因为节点可能崩溃，而系统也可能网络分区（network partition），锁机制也会阻止任务的继续执行。

因此ZooKeeper也需要实现处理这些情况的机制。

* 首先，客户端可以告诉ZooKeeper某些数据的状态是临时状态（ephemeral）；
* 其次，同时ZooKeeper需要客户端定时发送是否存活的通知，如果一个客户端未能及时发送通知，那么所有从属于这个客户端的临时状态的数据将全部被删除。

通过这两个机制，在崩溃或通信故障发生时，就可以预防客户端独立运行而发生的应用宕机。

#### 任务总结

根据之前描述的这些，可以得到以下主-从架构的需求：

* 主节点选举
	* 这是关键的一步，使得主节点可以给从节点分配任务。
* 崩溃检测
	* 主节点必须具有检测从节点崩溃或失去连接的能力。
* 组成员关系管理
	* 主节点必须具有知道哪一个从节点可以执行任务的能力。
* 元数据管理
	* 主节点和从节点必须具有通过某种可靠的方式来保存分配状态和执行状态的能力。

理想的方式是，以上每一个任务都需要通过原语的方式暴露给应用，对开发者完全隐藏实现细节。
ZooKeeper提供了实现这些原语的关键机制，因此，开发者可以通过这些实现一个最适合他们需求、更加关注应用逻辑的分布式应用。

### 分布式协作的难点

假设有一个分布式的配置信息发生了改变，这个配置信息简单到仅仅只有一个比特位（bit），一旦所有运行中的进程对配置位的值达成一致，应用中的进程就可以启动。

这个例子原本是一个在分布式计算领域非常著名的定律，被称为FLP（由其作者命名：Fischer，Lynch，Patterson），这个结论证明了在异步通信的分布式系统中，进程崩溃，所有进程可能无法在这个比特位的配置上达成一致。

类似的定律称为CAP，表示一致性（Consistency）、可用性（Availability）和分区容错性（Partition-tolerance），该定律指出，当设计一个分布式系统时，希望这三种属性全部满足，但没有系统可以同时满足这三种属性。
因此ZooKeeper的设计尽可能满足一致性和可用性，当然，在发生网络分区时ZooKeeper也提供了只读能力。

### ZooKeeper的成功和注意事项

完美的解决方案是不存在的，ZooKeeper无法解决分布式应用开发者面对的所有问题，而是为开发者提供了一个优雅的框架来处理这些问题。

多年以来，ZooKeeper在分布式计算领域进行了大量的工作。
Paxos算法和虚拟同步技术（virtual synchrony）给ZooKeeper的设计带来了很大影响，通过这些技术可以无缝地处理所发生的某些变化或情况，并提供给开发者一个框架，来应对无法自动处理的某些情况。

在使用ZooKeeper时，有些情况ZooKeeper自身无法进行决策而是需要开发者自己做出决策。

## ZooKeeper基础

很多用于协作的原语常常在很多应用之间共享，因此，设计一个用于协作需求的服务的方法往往是提供原语列表，暴露出每个原语的实例化调用方法，并直接控制这些实例。
比如，可以说分布式锁机制组成了一个重要的原语，同时暴露出创建（create）、获取（acquire）和释放（release）三个调用方法。

这种设计存在一些重大的缺陷：

* 首先，要么预先提出一份详尽的原语列表，要么提供API的扩展，以便引入新的原语；
* 其次，以这种方式实现原语的服务使得应用丧失了灵活性。

ZooKeeper并不直接暴露原语，取而代之，它暴露了由一小部分调用方法组成的类似文件系统的API，以便允许应用实现自己的原语。

通常使用菜谱（recipes）来表示这些原语的实现。菜谱包括ZooKeeper操作和维护一个小型的数据节点，这些节点被称为znode，采用类似于文件系统的层级树状结构进行管理。

![ZooKeeper数据树结构示例](/static/img/2018-08-06-ZooKeeper/2018-08-06-11-24-16.png)

* /workers节点作为父节点，其下每个znode子节点保存了系统中一个可用从节点信息。有一个从节点（foot.com：2181）。
* /tasks节点作为父节点，其下每个znode子节点保存了所有已经创建并等待从节点执行的任务的信息，主-从模式的应用的客户端在/tasks下添加一个znode子节点，用来表示一个新任务，并等待任务状态的znode节点。
* /assign节点作为父节点，其下每个znode子节点保存了分配到某个从节点的一个任务信息，当主节点为某个从节点分配了一个任务，就会在/assign下增加一个子节点。

### API概述

znode节点可能含有数据，也可能没有。如果一个znode节点包含任何数据，那么数据存储为字节数组（byte array）。

字节数组的具体格式特定于每个应用的实现，ZooKeeper并不直接提供解析的支持。
可以使用如Protocol Buffers、Thrift、Avro或MessagePack等序列化（Serialization）包来方便地处理保存于znode节点的数据格式，不过有些时候，以UTF-8或ASCII编码的字符串已经够用了。

ZooKeeper的API暴露了以下方法：

* create /path data
	* 创建一个名为/path的znode节点，并包含数据data。
* delete /path
	* 删除名为/path的znode。
* exists /path
	* 检查是否存在名为/path的节点。
* setData /path data
	* 设置名为/path的znode的数据为data。
* getData /path
	* 返回名为/path节点的数据信息。
* getChildren /path
	* 返回所有/path节点的所有子节点列表。

### znode的不同类型

当新建znode时，还需要指定该节点的类型（mode），不同的类型决定了znode节点的行为方式。

znode一共有4种类型：持久的（persistent）、临时的（ephemeral）、持久有序的（persistent_sequential）和临时有序的（ephemeral_sequential）。

#### 持久节点和临时节点

znode节点可以是持久（persistent）节点，还可以是临时（ephemeral）节点。

* 持久的znode，如/path，只能通过调用delete来进行删除。
* 临时的znode与之相反，当创建该节点的客户端崩溃或关闭了与ZooKeeper的连接时，这个节点就会被删除。

一个临时znode，在以下两种情况下将会被删除：

* 当创建该znode的客户端的会话因超时或主动关闭而中止时。
* 当某个客户端（不一定是创建者）主动删除该节点时。

因为临时的znode在其创建者的会话过期时被删除，所以现在不允许临时节点拥有子节点。

#### 有序节点

一个znode还可以设置为有序（sequential）节点。一个有序znode节点被分配唯一个单调递增的整数。当创建有序节点时，一个序号会被追加到路径之后。

有序znode通过提供了创建具有唯一名称的znode的简单方式。同时也通过这种方式可以直观地查看znode的创建顺序。

### 监视与通知

ZooKeeper通常以远程服务的方式被访问，如果每次访问znode时，客户端都需要获得节点中的内容，这样的代价就非常大。因为这样会导致更高的延迟，而且ZooKeeper需要做更多的操作。

![同一个znode的多次读取](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-07-35.png)

这是一个常见的轮询问题。为了替换客户端的轮询，选择了基于通知（notification）的机制：

客户端向ZooKeeper注册需要接收通知的znode，通过对znode设置监视点（watch）来接收通知。
监视点是一个单次触发的操作，意即监视点会触发一个通知。为了接收多个通知，客户端必须在每次通知后设置一个新的监视点。

当节点/tasks发生变化时，客户端会收到一个通知，并从ZooKeeper读取一个新值。

![使用通知机制来获悉znode的变化](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-09-19.png)

当使用通知机制时，还有一些需要知道的事情。因为通知机制是单次触发的操作，所以在客户端接收一个znode变更通知并设置新的监视点时，znode节点也许发生了新的变化（不要担心，你不会错过状态的变化）。

1. 客户端c1设置监视点来监控/tasks数据的变化。
2. 客户端c1连接后，向/tasks中添加了一个新的任务。
3. 客户端c1接收通知。
4. 客户端c1设置新的监视点，在设置完成前，第三个客户端c3连接后，向/tasks中添加了一个新的任务。

客户端c1最终设置了新的监视点，但由c3添加数据的变更并没有触发一个通知。
为了观察这个变更，在设置新的监视点前，c1实际上需要读取节点/tasks的状态，通过在设置监视点前读取ZooKeeper的状态，最终，c1就不会错过任何变更。

通知机制的一个重要保障是，对同一个znode的操作，先向客户端传送通知，然后再对该节点进行变更。如果客户端对一个znode设置了监视点，而该znode发生了两个连续更新。
第一次更新后，客户端在观察第二次变化前就接收到了通知，然后读取znode中的数据。
认为主要特性在于通知机制阻止了客户端所观察的更新顺序。虽然ZooKeeper的状态变化传播给某些客户端时更慢，但保障客户端以全局的顺序来观察ZooKeeper的状态。

ZooKeeper可以定义不同类型的通知，这依赖于设置监视点对应的通知类型。客户端可以设置多种监视点，如监控znode的数据变化、监控znode子节点的变化、监控znode的创建或删除。
为了设置监视点，可以使用任何API中的调用来读取ZooKeeper的状态，在调用这些API时，传入一个watcher对象或使用默认的watcher。

**谁来管理我的缓存**

> 如果不让客户端来管理其拥有的ZooKeeper数据的缓存，不得不让ZooKeeper来管理这些应用程序的缓存。但是，这样会导致ZooKeeper的设计更加复杂。
> 事实上，如果让ZooKeeper管理缓存失效，可能会导致ZooKeeper在运行时，停滞在等待客户端确认一个缓存失效的请求上，因为在进行所有的写操作前，需要确认所有的缓存数据是否已经失效。

### 版本

每一个znode都有一个版本号，它随着每次数据变化而自增。两个API操作可以有条件地执行：setData和delete。
这两个调用以版本号作为转入参数，只有当转入参数的版本号与服务器上的版本号一致时调用才会成功。
当多个ZooKeeper客户端对同一个znode进行操作时，版本的使用就会显得尤为重要。

![使用版本来阻止并行操作的不一致性](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-20-01.png)

## ZooKeeper架构

ZooKeeper服务器端运行于两种模式下：独立模式（standalone）和仲裁模式（quorum）。

* 独立模式几乎与其术语所描述的一样：有一个单独的服务器，ZooKeeper状态无法复制。
* 在仲裁模式下，具有一组ZooKeeper服务器，称为ZooKeeper集合（ZooKeeper ensemble），它们之前可以进行状态的复制，并同时为服务于客户端的请求。

从这个角度出发，使用术语“ZooKeeper集合”来表示一个服务器设施，这一设施可以由独立模式的一个服务器组成，也可以仲裁模式下的多个服务器组成。

![ZooKeeper架构总览](/static/img/2018-08-06-ZooKeeper/2018-08-06-14-24-16.png)

### ZooKeeper仲裁

在仲裁模式下，ZooKeeper复制集群中的所有服务器的数据树。但如果让一个客户端等待每个服务器完成数据保存后再继续，延迟问题将无法接受。

在公共管理领域，法定人数是指进行一项投票所需的立法者的最小数量。而在ZooKeeper中，则是指为了使ZooKeeper工作必须有效运行的服务器的最小数量。
这个数字也是服务器告知客户端安全保存数据前，需要保存客户端数据的服务器的最小个数。

例如，一共有5个ZooKeeper服务器，但法定人数为3个，这样，只要任何3个服务器保存了数据，客户端就可以继续，而其他两个服务器最终也将捕获到数据，并保存数据。

选择法定人数准确的大小是一个非常重要的事。法定人数的数量需要保证不管系统发生延迟或崩溃，服务主动确认的任何更新请求需要保持下去，直到另一个请求代替它。

通过使用多数方案，就可以容许f个服务器的崩溃，在这里，f为小于集合中服务器数量的一半。

如果有5个服务器，可以容许最多f=2个崩溃。在集合中，服务器的个数并不是必须为奇数，只是使用偶数会使得系统更加脆弱。
假设在集合中使用4个服务器，那么多数原则对应的数量为3个服务器。然而，这个系统仅能容许1个服务器崩溃，因为两个服务器崩溃就会导致系统失去多数原则的状态。
因此，在4个服务器的情况下，仅能容许一个服务器崩溃，而法定人数现在却更大，这意味着对每个请求，需要更多的确认操作。底线是需要争取奇数个服务器。

### 会话

会话的概念非常重要，对ZooKeeper的运行也非常关键。客户端提交给ZooKeeper的所有操作均关联在一个会话上。当一个会话因某种原因而中止时，在这个会话期间创建的临时节点将会消失。

当客户端通过某一个特定语言套件来创建一个ZooKeeper句柄时，它就会通过服务建立一个会话。客户端初始连接到集合中某一个服务器或一个独立的服务器。
客户端通过TCP协议与服务器进行连接并通信，但当会话无法与当前连接的服务器继续通信时，会话就可能转移到另一个服务器上。ZooKeeper客户端库透明地转移一个会话到不同的服务器。

会话提供了顺序保障，这就意味着同一个会话中的请求会以FIFO（先进先出）顺序执行。通常，一个客户端只打开一个会话，因此客户端请求将全部以FIFO顺序执行。
如果客户端拥有多个并发的会话，FIFO顺序在多个会话之间未必能够保持。而即使一个客户端中连贯的会话并不重叠，也未必能够保证FIFO顺序。

* 客户端建立了一个会话，并通过两个连续的异步调用来创建/tasks和/workers。
* 第一个会话过期。
* 客户端创建另一个会话，并通过异步调用创建/assign。

在这个调用顺序中，可能只有/tasks和/assign成功创建了，因为第一个会话保持了FIFO顺序，但在跨会话时就违反了FIFO顺序。

## 开始使用ZooKeeper

### 会话的状态和生命周期

会话的生命周期（lifetime）是指会话从创建到结束的时期，无论会话正常关闭还是因超时而导致过期。

一个会话的主要可能状态大多是简单明了的：CONNECTING、CONNECTED、CLOSED和NOT_CONNECTED。
状态的转换依赖于发生在客户端与服务之间的各种事件。

状态及状态的转换：

![状态及状态的转换](/static/img/2018-08-06-ZooKeeper/2018-08-06-17-59-40.png)

* 一个会话从NOT_CONNECTED状态开始，当ZooKeeper客户端初始化后转换到CONNECTING状态（箭头1）。
* 正常情况下，成功与ZooKeeper服务器建立连接后，会话转换到CONNECTED状态（箭头2）。
* 当客户端与ZooKeeper服务器断开连接或者无法收到服务器的响应时，它就会转换回CONNECTING状态（箭头3）并尝试发现其他ZooKeeper服务器。
* 如果可以发现另一个服务器或重连到原来的服务器，当服务器确认会话有效后，状态又会转换回CONNECTED状态。否则，它将会声明会话过期，然后转换到CLOSED状态（箭头4）。
* 应用也可以显式地关闭会话（箭头4和箭头5）。

**发生网络分区时等待CONNECTING**

> 如果一个客户端与服务器因超时而断开连接，客户端仍然保持CONNECTING状态。  
> 如果因网络分区问题导致客户端与ZooKeeper集合被隔离而发生连接断开，那么其状态将会一直保持，
> 直到显式地关闭这个会话，或者分区问题修复后，客户端能够获悉ZooKeeper服务器发送的会话已经过期。
> 发生这种行为是因为ZooKeeper集合对声明会话超时负责，而不是客户端负责。  
> 直到客户端获悉ZooKeeper会话过期，否则客户端不能声明自己的会话过期。然而，客户端可以选择关闭会话。

**客户端会尝试连接哪一个服务器？**

> 在仲裁模式下，客户端有多个服务器可以连接，而在独立模式下，客户端只能尝试重新连接单个服务器。
> 在仲裁模式中，应用需要传递可用的服务器列表给客户端，告知客户端可以连接的服务器信息并选择一个进行连接。

创建一个会话时，你需要设置会话超时这个重要的参数，这个参数设置了ZooKeeper服务允许会话被声明为超时之前存在的时间。
如果经过时间t之后服务接收不到这个会话的任何消息，服务就会声明会话过期。

而在客户端侧，如果经过t/3的时间未收到任何消息，客户端将向服务器发送心跳消息。在经过2t/3时间后，ZooKeeper客户端开始寻找其他的服务器，而此时它还有t/3时间去寻找。

当尝试连接到一个不同的服务器时，非常重要的是，这个服务器的ZooKeeper状态要与最后连接的服务器的ZooKeeper状态保持最新。

客户端不能连接到这样的服务器：它未发现更新而客户端却已经发现的更新。ZooKeeper通过在服务中排序更新操作来决定状态是否最新。
ZooKeeper确保每一个变化相对于所有其他已执行的更新是完全有序的。因此，如果一个客户端在位置i观察到一个更新，它就不能连接到只观察到`i'<i`的服务器上。
在ZooKeeper实现中，系统根据每一个更新建立的顺序来分配给事务标识符。

在重连情况下事务标识符（zkid）的使用:

![客户端重连的例子](/static/img/2018-08-06-ZooKeeper/2018-08-06-18-09-22.png)

当客户端因超时与s1断开连接后，客户端开始尝试连接s2，但s2延迟于客户端所知的变化。然而，s3对这个变化的情况与客户端保持一致，所以s3 可以安全连接。

### ZooKeeper与仲裁模式

**简单的负载均衡**

> 客户端以随机顺序连接到连接串中的服务器。这样可以用ZooKeeper来实现一个简单的负载均衡。不过，客户端无法指定优先选择的服务器来进行连接。

例如，如果有5个ZooKeeper服务器的一个集合，其中3个在美国西海岸，另外两个在美国东海岸，为了确保客户端只连接到本地服务器上，
可以使在东海岸客户端的连接串中只出现东海岸的服务器，在西海岸客户端的连接串中只有西海岸的服务器。

```shell
/{PATH_TO_ZK}/bin/zkCli.sh -server 127.0.0.1:2181,127.0.0.1:2182,127.0.0.1:2183
```

### 通过ZooKeeper实现锁

创建临时节点/lock，方式进程崩溃而无法解锁。其它进程因为存在创建失败而监听/lock的变化，检测到删除时再次尝试建立节点来获得锁。

## 使用ZooKeeper进行开发

### 建立ZooKeeper会话

ZooKeeper的API围绕ZooKeeper的句柄（handle）而构建，每个API调用都需要传递这个句柄。这个句柄代表与ZooKeeper之间的一个会话。

与ZooKeeper服务器已经建立的一个会话如果断开，这个会话就会迁移到另一台ZooKeeper服务器上。
只要会话还存活着，这个句柄就仍然有效，ZooKeeper客户端库会持续保持这个活跃连接，以保证与ZooKeeper服务器之间的会话存活。
如果句柄关闭，ZooKeeper客户端库会告知ZooKeeper服务器终止这个会话。如果ZooKeeper发现客户端已经死掉，就会使这个会话无效。
如果客户端之后尝试重新连接到ZooKeeper服务器，使用之前无效会话对应的那个句柄进行连接，那么ZooKeeper服务器会通知客户端库，这个会话已失效，使用这个句柄进行的任何操作都会返回错误。

会话在两个服务器之间发生迁移：

![会话在两个服务器之间发生迁移](/static/img/2018-08-06-ZooKeeper/2018-08-06-21-25-41.png)

```java
ZooKeeper(
    String connectString,
    int sessionTimeout,
    Watcher watcher)
```

* connectString
	* 包含主机名和ZooKeeper服务器的端口。
* sessionTimeout
	* 以毫秒为单位，表示ZooKeeper等待客户端通信的最长时间，之后会声明会话已死亡。
	* ZooKeeper会话一般设置超时时间为5~10秒。
* watcher
	* 用于接收会话事件的一个对象，这个对象需要自己创建。
	* Wacher定义为接口，所以需要自己实现一个类，然后初始化这个类的实例并传入ZooKeeper的构造函数中。
		* 客户端使用Watcher接口来监控与ZooKeeper之间会话的健康情况。
		* 与ZooKeeper服务器之间建立或失去连接时就会产生事件。
		* 它们同样还能用于监控ZooKeeper数据的变化。
		* 最终，如果与ZooKeeper的会话过期，也会通过Watcher接口传递事件来通知客户端的应用。

**ZooKeeper管理连接**

> 请不要自己试着去管理ZooKeeper客户端连接。
> ZooKeeper客户端库会监控与服务之间的连接，客户端库不仅告诉连接发生问题，还会主动尝试重新建立通信。
> 一般客户端开发库会很快重建会话，以便最小化应用的影响。所以不要关闭会话后再启动一个新的会话，这样会增加系统负载，并导致更长时间的中断。

#### 实现一个Watcher

```java
public class Master implements Watcher, Closeable {
	private ZooKeeper zk;
    private String hostPort;
	Master(String hostPort) { 
        this.hostPort = hostPort;
    }
	void startZK() throws IOException {
        zk = new ZooKeeper(hostPort, 15000, this);
    }
    void stopZK() throws InterruptedException, IOException {
        zk.close();
    }
	@Override
    public void process(WatchedEvent e) {
        System.out.println(e);
    }
}
```

```java
Master m = new Master(args[0]);
m.startZK();
Thread.sleep(10000);
// 主动关闭，否则要等到超时关闭
m.stopZK();
```

### 获取管理权

create方法会抛出两种异常：KeeperException和InterruptedException。

```java
private String serverId = Integer.toHexString(random.nextInt());
boolean isLeader = false;
public void runForMasterWithExceptionCaught() throws InterruptedException{
	while (true) {
		try {
			zk.create("/master",
					serverId.getBytes(),
					Ids.OPEN_ACL_UNSAFE,
					CreateMode.EPHEMERAL
			);
			isLeader = true;
			break;
		} catch (KeeperException.NodeExistsException e) {
			// 已被申请master
			isLeader = false;
			break;
		} catch (KeeperException ignored) {
		}
		if (checkIsLeader()) {
			break;
		}
	}
}

当处理ConnectionLossException异常时，需要找出那个进程创建的/master节点，如果进程是自己，就开始成为群首角色。通过getData方法来处理：

```java
byte[] getData(
    String path,
    bool watch,
    Stat stat)
```

* path
	* 类似其他ZooKeeper方法一样，第一个参数为想要获取数据的znode节点路径。
* watch
	* 表示是否想要监听后续的数据变更。
		* 如果设置为true，就可以通过创建ZooKeeper句柄时所设置的Watcher对象得到事件，同时另一个版本的方法提供了以Watcher对象为入参，通过这个传入的对象来接收变更的事件。
* stat
	* 最后一个参数类型Stat结构，getData方法会填充znode节点的元数据信息。
* 返回值
	* 方法返回成功（没有抛出异常），就会得到znode节点数据的字节数组。

```java
boolean checkIsLeader() {
	while (true) {
		try {
			Stat stat = new Stat();
			// 获取数据判断
			byte data[] = zk.getData("/master", false, stat);
			isLeader = new String(data).equals(serverId);
			return true;
		} catch (KeeperException.NoNodeException e) {
			// create again
			return false;
		} catch (InterruptedException | KeeperException ignored) {
		}
	}
}
```

需要确保处理了这两种异常，特别是ConnectionLossException（KeeperException异常的子类）和InterruptedException。
对于其他异常，可以忽略并继续执行，但对于这两种异常，create方法可能已经成功了，所以如果作为主节点就需要捕获并处理它们。

ConnectionLossException异常发生于客户端与ZooKeeper服务端失去连接时。一般常常由于网络原因导致，如网络分区或ZooKeeper服务器故障。
当这个异常发生时，客户端并不知道是在ZooKeeper服务器处理前丢失了请求消息，还是在处理后客户端未收到响应消息。
ZooKeeper的客户端库将会为后续请求重新建立连接，但进程必须知道一个未决请求是否已经处理了还是需要再次发送请求。

InterruptedException异常源于客户端线程调用了Thread.interrupt，通常这是因为应用程序部分关闭，但还在被其他相关应用的方法使用。
进程会中断本地客户端的请求处理的过程，并使该请求处于未知状态。

这两种请求都会导致正常请求处理过程的中断，开发者不能假设处理过程中的请求的状态。当处理这些异常时，开发者在处理前必须知道系统的状态。
如果发生群首选举，在没有确认情况之前，不希望确定主节点。如果create执行成功了，活动主节点死掉以前，没有任何进程能够成为主节点，如果活动主节点还不知道自己已经获得了管理权，不会有任何进程成为主节点进程。

在这个例子中，简单地传递InterruptedException给调用者，即向上传递异常。

InterruptedException异常的处理依赖于程序的上下文环境，如果向上抛出InterruptedException异常，最终关闭zk句柄，可以抛出异常到调用栈顶，当句柄关闭时就可以清理所有一切。
如果zk句柄未关闭，在重新抛出异常前，需要弄清楚自己是不是主节点，或者继续异步执行后续操作。后者情况非常棘手，需要仔细设计并妥善处理。

#### 异步获取管理权

ZooKeeper中，所有同步调用方法都有对应的异步调用方法。通过异步调用，可以在单线程中同时进行多个调用，同时也可以简化的实现方式。

```java
void create(String path,
    byte[] data,
    List<ACL> acl,
    CreateMode createMode,
	// 回调方法
    AsyncCallback.StringCallback cb,
	// 上下文，回调方法调用是传入的对象实例
    Object ctx)
```

该方法调用后通常在create请求发送到服务端之前就会立即返回。
回调对象通过传入的上下文参数来获取数据，当从服务器接收到create请求的结果时，上下文参数就会通过回调对象提供给应用程序。

_注意，该create方法不会抛出异常，可以简化处理，因为调用返回前并不会等待create命令完成，所以无需关心_

异步方法调用会简单化队列对ZooKeeper服务器的请求，并在另一个线程中传输请求。当接收到响应信息，这些请求就会在一个专用回调线程中被处理。
为了保持顺序，只会有一个单独的线程按照接收顺序处理响应包。

```java
interface StringCallback extends AsyncCallback {
    public void processResult(int rc, String path, Object ctx, String name);
```

* rc
	* 返回调用的结构，返回OK或与KeeperException异常对应的编码值。
* path
	* 传给create的path参数值。
* ctx
	* 传给create的上下文参数。
* name
	* 创建的znode节点名称。
	* 目前，调用成功后，path和name的值一样，但是，如果采用CreateMode.SEQUENTIAL模式，这两个参数值就不会相等。

**回调函数处理**

> 因为只有一个单独的线程处理所有回调调用，如果回调函数阻塞，所有后续回调调用都会被阻塞，也就是说，一般不要在回调函数中集中操作或阻塞操作。
> 有时，在回调函数中调用同步方法是合法的，但一般还是避免这样做，以便后续回调调用可以快速被处理。

```java
public void runForMaster() {
	LOG.info("Running for master");
	zk.create("/master",
			serverId.getBytes(),
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.EPHEMERAL,
			masterCreateCallback,
			null
	);
}
StringCallback masterCreateCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				checkMaster();
				break;
			case OK:
				isLeader = true;
				break;
			default:
				isLeader = false;
		}
		LOG.info("I'm " + (state == MasterStates.ELECTED ? "" : "not ") + "the leader " + serverId);
	}
};

DataCallback masterCheckCallback = new DataCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, byte[] data, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				checkMaster();
				break;
			case NONODE:
				runForMaster();
				break;
		}
	}
};
void checkMaster() {
	zk.getData("/master", false, masterCheckCallback, null);
}
```

#### 设置元数据

```java
public void bootstrap() {
	createParent("/workers", new byte[0]);
	createParent("/assign", new byte[0]);
	createParent("/tasks", new byte[0]);
	createParent("/status", new byte[0]);
}
void createParent(String path, byte[] data) {
	zk.create(path,
			data,
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.PERSISTENT,
			createParentCallback,
			data);
}
StringCallback createParentCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 重试
				createParent(path, (byte[]) ctx);
				break;
			case OK:
				LOG.info("Parent created");
				break;
			case NODEEXISTS:
				LOG.warn("Parent already registered: " + path);
				break;
			default:
				LOG.error("Something went wrong: ", KeeperException.create(Code.get(rc), path));
		}
	}
};
```

### 注册从节点

```java
public class Worker implements Watcher, Closeable {
	private ZooKeeper zk;
	private String hostPort;
	private String serverId = Integer.toHexString((new Random()).nextInt());
	String name;
	public void register() {
		name = "worker-" + serverId;
		zk.create("/workers/" + name,
			"Idle".getBytes(),
			Ids.OPEN_ACL_UNSAFE,
			// 临时节点
			CreateMode.EPHEMERAL,
			createWorkerCallback, null);
	}
	StringCallback createWorkerCallback = new StringCallback() {
		@Override
		public void processResult(int rc, String path, Object ctx, String name) {
			switch (Code.get(rc)) {
				case CONNECTIONLOSS:
					// 重试
					register();
					break;
				case OK:
					LOG.info("Registered successfully: " + serverId);
					break;
				case NODEEXISTS:
					LOG.warn("Already registered: " + serverId);
					break;
				default:
					LOG.error("Something went wrong: ", KeeperException.create(Code.get(rc), path));
			}
		}
	};
	StatCallback statusUpdateCallback = new StatCallback() {
		public void processResult(int rc, String path, Object ctx, Stat stat) {
			switch (Code.get(rc)) {
				case CONNECTIONLOSS:
					// 重试
					updateStatus((String) ctx);
					return;
			}
		}
	};
	String status;
	synchronized private void updateStatus(String status) {
		// 竟态条件检查，因为这里的callback存在顺序问题，所以要检查是否重试
		if (status == this.status) {
			// 第三个参数-1表示进制版本号检查，通过上下文传递status
			zk.setData("/workers/" + name, status.getBytes(), -1,
				statusUpdateCallback, status);
		}
	}
	public void setStatus(String status) {
		// 记录当前状态，重试检查时使用
		this.status = status;
		updateStatus(status);
	}
}
```

理解连接丢失时补发操作的问题，考虑以下场景：

1. 从节点开始执行任务task-1，因此设置其状态为working on task-1。
2. 客户端库尝试通过setData来实现，但此时遇到了网络问题。
3. 客户端库确定与ZooKeeper的连接已经丢失，同时在statusUpdateCallback调用前，从节点完成了任务task-1并处于空闲状态。
4. 从节点调用客户端库，使用setData方法置状态为Idle。
5. 之后客户端处理连接丢失的事件，如果updateStatus方法未检查当前状态，setData调用还是会设置状态为working on task-1。
6. 当与ZooKeeper连接重新建立时，客户端库会按顺序如实地调用这两个setData操作，这就意味着最终状态为working on task-1。

在updateStatus方法中，在补发setData之前，先检查当前状态，这样·就可以避免以上场景。

**顺序和ConnectionLossException异常**

> ZooKeeper会严格地维护执行顺序，并提供了强有力的有序保障，然而，在多线程下还是需要小心面对顺序问题。
> 多线程下，当回调函数中包括重试逻辑的代码时，一些常见的场景都可能导致错误发生。
> 当遇到ConnectionLossException异常而补发一个请求时，新建立的请求可能排序在其他线程中的请求之后，而实际上其他线程中的请求应该在原来请求之后。

### 任务队列化

使用有序节点，有两个好处：

* 第一，序列号指定了任务被队列化的顺序；
* 第二，可以通过很少的工作为任务创建基于序列号的唯一路径。

```java
public class Client implements Watcher, Closeable {
    private static final Logger LOG = LoggerFactory.getLogger(Master.class);
    ZooKeeper zk;
    String hostPort;
	Client(String hostPort) { 
        this.hostPort = hostPort;
    }
    String queueCommand(String command) throws KeeperException, InterruptedException {
        while (true) {
            try {
				// 后缀递增id的name，ZooKeeper确定顺序
                String name = zk.create("/task/task-",
                        command.getBytes(),
                        OPEN_ACL_UNSAFE,
                        CreateMode.EPHEMERAL_SEQUENTIAL);
                return name;
            } catch (KeeperException.ConnectionLossException ignore) {
            }
        }
	}
	public static void main(String args[]) throws Exception {
        Client c = new Client(args[0]);
        c.startZK();
		String name = c.queueCommand(args[1]);
		System.out.println("Created " + name);
		c.stopZK();
    }
}
```

如果在执行create时遇到连接丢失，需要重试create操作。因为多次执行创建操作，也许会为一个任务建立多个znode节点，对于大多数至少执行一次（execute-at-least-once）策略的应用程序，也没什么问题。
对于某些最多执行一次（execute-at-most-once）策略的应用程序，就需要多一些额外工作：

需要为每一个任务指定一个唯一的ID（如会话ID），并将其编码到znode节点名中，在遇到连接丢失的异常时，只有在/tasks下不存在以这个会话ID命名的节点时才重试命令。

### 管理客户端

```java
public class AdminClient implements Watcher {
    private ZooKeeper zooKeeper;
    private String hostPort;

    public AdminClient(String hostPort) {
        this.hostPort = hostPort;
    }

    public void start() throws IOException {
        zooKeeper = new ZooKeeper(hostPort, 15000, this);
    }

    public void stop() throws InterruptedException {
        zooKeeper.close();
    }

    @Override
    public void process(WatchedEvent event) {
        System.out.println(event);
    }
    public void listStat() throws KeeperException, InterruptedException {
        try {
            Stat stat = new Stat();
			final byte[] data = zooKeeper.getData("/master", false, stat);
			// 节点建立时的秒数
            Date startDate = new Date(stat.getCtime());
            System.out.println("Master: " + new String(data) + "since " + startDate);

        } catch (KeeperException.NoNodeException e) {
            System.out.println("No Master");
        }
        System.out.println("Workers:");
        for (String w : zooKeeper.getChildren("/workers", false)) {
            byte data[] = zooKeeper.getData("/workers/" + w, false, null);
            String state = new String(data);
            System.out.println("\t" + w + " " + state);
        }
        System.out.println("Tasks:");
        for (String t : zooKeeper.getChildren("/assign", false)) {
            String state = new String(t);
            System.out.println("\t" + t);
        }

    }
    public static void main(String[] args) throws Exception {
        AdminClient adminClient = new AdminClient(args[0]);
        adminClient.start();
        adminClient.listStat();
        adminClient.stop();
    }
}
```

### 总结

* 需要处理异常情况使得的代码非常复杂，尤其是ConnectionLossException异常，开发者需要检查系统状态并合理恢复（ZooKeeper用于协助管理分布式状态，提供了故障处理的框架，但遗憾的是，它并不能让故障消失）。
* 其次，适应异步API的开发非常有用，异步API提供了巨大的性能优势，简化了错误恢复工作。

## 处理状态变化

### 单次触发器

* 事件（event）表示一个znode节点执行了更新操作。
* 监视点（watch）表示一个与之关联的znode节点和事件类型组成的单次触发器（例如，znode节点的数据被赋值，或znode节点被删除）。
* 当一个监视点被一个事件触发时，就会产生一个通知（notification）。通知是注册了监视点的应用客户端收到的事件报告的消息。

当应用程序注册了一个监视点来接收通知，匹配该监视点条件的第一个事件会触发监视点的通知，并且最多只触发一次。

例如，当znode节点/z被删除，客户端需要知道该变化（例如，表示备份主节点），客户端在/z节点执行exists操作并设置监视点标志位，等待通知，客户端会以回调函数的形式收到通知。

客户端设置的每个监视点与会话关联，如果会话过期，等待中的监视点将会被删除。不过监视点可以跨越不同服务端的连接而保持。

例如，当一个ZooKeeper客户端与一个ZooKeeper服务端的连接断开后连接到集合中的另一个服务端，客户端会发送未触发的监视点列表，在注册监视点时，
服务端将要检查已监视的znode节点在之前注册监视点之后是否已经变化，如果znode节点已经发生变化，一个监视点的事件就会被发送给客户端，否则在新的服务端上注册监视点。

**单次触发是否会丢失事件**

答案是肯定的。

一个应用在接收到通知后，注册另一个监视点时，可能会丢失事件。
丢失事件通常并不是问题，因为任何在接收通知与注册新监视点之间的变化情况，均可以通过读取ZooKeeper的状态信息来获得。

实际上，将多个事件分摊到一个通知上具有积极的作用。应用进行高频率的更新操作时，这种通知机制比每个事件都发送通知更加轻量化。

举个例子，如果每个通知平均捕获两个事件，为每个事件只产生了0.5个通知，而不是每个事件1个通知。

### 如何设置监控点

ZooKeeper的API中的所有读操作：getData、getChildren和exists，均可以选择在读取的znode节点上设置监视点。

使用监视点机制，需要实现Watcher接口类，实现其中的process方法：

```java
public void process(WatchedEvent event);
```

WatchedEvent数据结构包括以下信息：

* ZooKeeper会话状态（KeeperState）：Disconnected、SyncConnected、AuthFailed、ConnectedReadOnly、SaslAuthenticated和Expired。
* 事件类型（EventType）：NodeCreated、NodeDeleted、NodeDataChanged、NodeChildrenChanged和None。
	* 前三个事件类型只涉及单个znode节点，第四个事件类型涉及监视的znode节点的子节点。
	* 使用None表示无事件发生，而是ZooKeeper的会话状态发生了变化。
* 如果事件类型不是None时，返回一个znode路径。

监视点有两种类型：数据监视点和子节点监视点。

* 创建、删除或设置一个znode节点的数据都会触发数据监视点，exists和getData这两个操作可以设置数据监视点。
* 只有getChildren操作可以设置子节点监视点，这种监视点只有在znode子节点创建或删除时才被触发。

对于每种事件类型，通过以下调用设置监视点：

* NodeCreated
	* 通过exists调用设置一个监视点。
* NodeDeleted
	* 通过exists或getData调用设置监视点。
* NodeDataChanged
	* 通过exists或getData调用设置监视点。
* NodeChildrenChanged
	* 通过getChildren调用设置监视点。

当创建一个ZooKeeper对象，需要传递一个默认的Watcher对象，ZooKeeper客户端使用这个监视点来通知应用ZooKeeper状态的变化情况，如会话状态的变化。

对于ZooKeeper节点的事件的通知，你可以使用默认的监视点，也可以单独实现一个。

```java
// 使用自定义watcher
public byte[] getData(final String path, Watcher watcher, Stat stat);
// 是否使用默认watcher
public byte[] getData(String path, boolean watch, Stat stat);
```

两个方法第一个参数均为znode节点，第一个方法传递一个新的Watcher对象
第二个方法则告诉客户端使用默认的监视点，只需要在调用时将第二个参数传递true。

stat入参为Stat类型的实例化对象，ZooKeeper使用该对象返回指定的path参数的znode节点信息。
Stat结构包括znode节点的属性信息，如该znode节点的上次更新（zxid）的时间戳，以及该znode节点的子节点数。

对于监视点的一个重要问题是，一旦设置监视点就无法移除。要想移除一个监视点，只有两个方法，一是触发这个监视点，二是使其会话被关闭或过期。
社区致力于在版本3.5.0中提供该功能。

**关于一些重载**

> 在ZooKeeper的会话状态和znode节点的变化事件中，使用了相同的监视机制来处理应用程序的相关事件的通知。
> 虽然会话状态的变化和znode状态的变化组成了两个独立的事件集合，为简单其见，使用了相同的机制传送这些事件。

### 普遍模型

ZooKeeper的应用中使用的通用代码的模型：

1. 进行调用异步。
2. 实现回调对象，并传入异步调用函数中。
3. 如果操作需要设置监视点，实现一个Watcher对象，并传入异步调用函数中。

```java
zk.exists("/myZnode",
          myWatcher,
          existsCallback,
          null);
Watcher myWatcher = new Watcher() {
    public void process(WatchedEvent e) {
        // Process the watch event
    }
}
StatCallback existsCallback = new StatCallback() {
    public void processResult(int rc, String path, Object ctx, Stat stat) {
        // Process the result of the exists call
    }
};
```

### 管理权变化

应用客户端通过创建/master节点来推选自己为主节点（称为“主节点竞选”），如果znode节点已经存在，应用客户端确认自己不是主要主节点并返回，
然而，这种实现方式无法容忍主要主节点的崩溃。如果主要主节点崩溃，备份主节点并不知道，因此需要在/master上设置监视点，在节点删除时（无论是显式关闭还是因为主要主节点的会话过期），ZooKeeper会通知客户端。

```java
// master创建回调
StringCallback masterCreateCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 检查master，来确实是否能够创建节点
				checkMaster();
				break;
			case OK:
				state = MasterStates.ELECTED;
				// OK就行使领导权
				takeLeadership();
				break;
			case NODEEXISTS:
				state = MasterStates.NOTELECTED;
				// 已经存在就监视节点变化 
				masterExists();
				break;
			default:
				state = MasterStates.NOTELECTED;
				LOG.error("Something went wrong when running for master.",
						KeeperException.create(Code.get(rc), path));
		}
		LOG.info("I'm " + (state == MasterStates.ELECTED ? "" : "not ") + "the leader " + serverId);
	}
};
void masterExists() {
	// exist监视
	zk.exists("/master",
			masterExistsWatcher,
			masterExistsCallback,
			null);
}
Watcher masterExistsWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeDeleted) {
			assert "/master".equals(e.getPath());
			// 获取master所有权
			runForMaster();
		}
	}
};
```



```java
StatCallback masterExistsCallback = new StatCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 失败重试
				masterExists();
				break;
			case OK:
				// 如果create回调和exist执行期间被删除，返回OK后判断stat是否为空
				// 因为无法保证监听点设置在节点删除之前
				if (stat == null) {
					state = MasterStates.RUNNING;
					// 尝试称为master
					runForMaster();
				}
				break;
			case NONODE:
				state = MasterStates.RUNNING;
				runForMaster();
				LOG.info("It sounds like the previous master is gone, " +
						"so let's run for master again.");
				break;
			default:
				// 其它情况检查/master节点做出判断
				// 如果是创建通知，则会通过masterCheckCallback的NONODE重新竞选
				checkMaster();
				break;
		}
	}
};
```

只要客户端程序运行中，且没有成为主要主节点，客户端竞选主节点并执行exists来设置监视点，这一模式就会一直运行下去。
如果客户端成为主要主节点，但却崩溃了，客户端重启还继续重新执行这些代码。

主节点竞选中可能的交错操作：

![主节点竞选中可能的交错操作](/static/img/2018-08-06-ZooKeeper/2018-08-08-21-31-11.png)

如果竞选主节点成功，create操作执行完成，应用客户端不需要做其他事情（图中a）。  
如果create操作失败，则意味着该节点已经存在，客户端就会执行exists操作来设置/master节点的监视点（图中b）。  
在竞选主节点和执行exists操作之间，也许/master节点已经删除了，这时，如果exists调用返回该节点依然存在，客户端只需要等待通知的到来，否则就需要再次尝试创建/master进行竞选主节点操作。
如果创建/master节点成功，监视点就会被触发，表示znode节点发生了变化（图中c），不过，这个通知没有什么意义，因为这是客户端自己引起的变化。  
如果再次执行create操作失败，就会通过执行exists设置监视点来重新执行这一流程（图中d）。

### 主节点等待从节点的变化

系统中任何时候都可能发生新的从节点加入进来，或旧的从节点退役的情况，从节点执行分配给它的任务前也许会崩溃。
为了确认某个时间点可用的从节点信息，通过在ZooKeeper中的/workers下添加子节点来注册新的从节点。
当一个从节点崩溃或从系统中被移除，如会话过期等情况，需要自动将对应的znode节点删除。优雅实现的从节点会显式地关闭其会话，而不需要ZooKeeper等待会话过期。

```java
Watcher workersChangeWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeChildrenChanged) {
			assert "/workers".equals(e.getPath());
			getWorkers();
		}
	}
};

void getWorkers() {
	zk.getChildren("/workers",
			workersChangeWatcher,
			workersGetChildrenCallback,
			null);
}

ChildrenCallback workersGetChildrenCallback = new ChildrenCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, List<String> children) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				// 重新获取并监视
				getWorkers();
				break;
			case OK:
				LOG.info("Succesfully got a list of workers: "
						+ children.size()
						+ " workers");
				// 重新分配崩溃节点任务，并重新设置从节点列表
				reassignAndSet(children);
				break;
			default:
				LOG.error("getChildren failed",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
// 本地缓存
protected ChildrenCache workersCache;

void reassignAndSet(List<String> children) {
	List<String> toProcess;

	if (workersCache == null) {
		// 第一次初始化
		workersCache = new ChildrenCache(children);
		toProcess = null;
	} else {
		LOG.info("Removing and setting");
		// 检查是否有节点被移除了
		toProcess = workersCache.removedAndSet(children);
	}
	// 重新分配任务
	if (toProcess != null) {
		for (String worker : toProcess) {
			getAbsentWorkerTasks(worker);
		}
	}
}
```

需要保存之前获得的信息，因此使用本地缓存。假设在第一次获得从节点列表后，当收到从节点列表更新的通知时，如果没有保存旧的信息，即使再次读取信息也不知道具体变化的信息是什么。
本例中的缓存类简单地保存主节点上次读取的列表信息，并实现检查变化信息的一些方法。

**基于CONNECTIONLOSS事件的监视**

> 监视点的操作执行成功后就会为一个znode节点设置一个监视点，如果ZooKeeper的操作因为客户端连接断开而失败，应用需要再次执行这些调用。

### 主节点等待新任务进行分配

与等待从节点列表变化类似，主要主节点等待添加到/tasks节点中的新任务。主节点首先获得当前的任务集，并设置变化情况的监视点。
在ZooKeeper中，/tasks的子节点表示任务集，每个子节点对应一个任务，一旦主节点获得还未分配的任务信息，主节点会随机选择一个从节点，将这个任务分配给从节点。

```java
Watcher tasksChangeWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeChildrenChanged) {
			assert "/tasks".equals(e.getPath());
			getTasks();
		}
	}
};

void getTasks() {
	zk.getChildren("/tasks",
			tasksChangeWatcher,
			tasksGetChildrenCallback,
			null);
}

ChildrenCallback tasksGetChildrenCallback = new ChildrenCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, List<String> children) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				getTasks();
				break;
			case OK:
				// List<String> toProcess;
				// if (tasksCache == null) {
				// 	tasksCache = new ChildrenCache(children);
				// 	toProcess = children;
				// } else {
				// 	toProcess = tasksCache.addedAndSet(children);
				// }
				// if (toProcess != null) {
				// 这里简化了设计，因为分配完会删除，所以拿到的都是未分配的
				if (children != null) {
					// 分配列表任务
					assignTasks(toProcess);
				}
				break;
			default:
				LOG.error("getChildren failed.",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
```

```java
void assignTasks(List<String> tasks) {
	for (String task : tasks) {
		getTaskData(task);
	}
}
void getTaskData(String task) {
	zk.getData("/tasks/" + task,
			false,
			taskDataCallback,
			task);
}

DataCallback taskDataCallback = new DataCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, byte[] data, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				getTaskData((String) ctx);
				break;
			case OK:
				/*
				 * Choose worker at random.
				 */
				List<String> list = workersCache.getList();
				String designatedWorker = list.get(random.nextInt(list.size()));
				/*
				 * Assign task to randomly chosen worker.
				 */
				String assignmentPath = "/assign/" + designatedWorker + "/" + (String) ctx;
				LOG.info("Assignment path: " + assignmentPath);
				// 分配任务
				createAssignment(assignmentPath, data);
				break;
			default:
				LOG.error("Error when trying to get task data.",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
```

```java
void createAssignment(String path, byte[] data) {
	// 创建分配节点
	zk.create(path,
			data,
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.PERSISTENT,
			assignTaskCallback,
			data);
}

StringCallback assignTaskCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				createAssignment(path, (byte[]) ctx);
				break;
			case OK:
				LOG.info("Task assigned correctly: " + name);
				// 删除/task下任务
				deleteTask(name.substring(name.lastIndexOf("/") + 1));
				break;
			case NODEEXISTS:
				LOG.warn("Task already assigned");
				break;
			default:
				LOG.error("Error when trying to assign task.",
						KeeperException.create(Code.get(rc), path));
		}
	}
};
```

对于新任务，主节点选择一个从节点分配任务之后，主节点就会在/assign/work-id节点下创建一个新的znode节点，其中id为从节点标识符，之后主节点从任务列表中删除该任务节点。

当主节点为某个标识符为id的从节点创建任务分配节点时，假设从节点在任务分配节点（/assign/work-id）上注册了监视点，ZooKeeper会向从节点发送一个通知。

_注意，主节点在成功分配任务后，会删除/tasks节点下对应的任务。这种方式简化了主节点角色接收新任务并分配的设计，如果任务列表中混合的已分配和未分配的任务，主节点还需要区分这些任务。_

```java
void deleteTask(String name) {
	zk.delete("/tasks/" + name, -1, taskDeleteCallback, null);
}

VoidCallback taskDeleteCallback = new VoidCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				deleteTask(path);
				break;
			case OK:
				LOG.info("Successfully deleted " + path);
				break;
			case NONODE:
				LOG.info("Task has been deleted already");
				break;
			default:
				LOG.error("Something went wrong here, " + KeeperException.create(Code.get(rc), path));
		}
	}
};
```

### 从节点等待分配新任务

从节点第一步需要先向ZooKeeper注册自己。

```java
public void register() {
	name = "worker-" + serverId;
	zk.create("/workers/" + name,
			new byte[0],
			Ids.OPEN_ACL_UNSAFE,
			CreateMode.EPHEMERAL,
			createWorkerCallback, null);
}

StringCallback createWorkerCallback = new StringCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				/*
				 * Try again. Note that registering again is not a problem.
				 * If the znode has already been created, then we get a
				 * NODEEXISTS event back.
				 */
				register();
				break;
			case OK:
				LOG.info("Registered successfully: " + serverId);
				break;
			case NODEEXISTS:
				LOG.warn("Already registered: " + serverId);
				break;
			default:
				LOG.error("Something went wrong: ", KeeperException.create(Code.get(rc), path));
		}
	}
};
```

添加该znode节点会通知主节点，这个从节点的状态是活跃的，且已准备好处理任务。这里为了简化没有使用idle/busy状态

同样，还创建了/assign/work-id节点，这样，主节点可以为这个从节点分配任务。

如果在创建/assign/worker-id节点之前创建了/workers/worker-id节点，可能会陷入以下情况，主节点尝试分配任务，因分配节点的父节点还没有创建，导致主节点分配失败。
为了避免这种情况，需要先创建/assign/worker-id节点，而且从节点需要在/assign/worker-id节点上设置监视点来接收新任务分配的通知。

一旦有任务列表分配给从节点，从节点就会从/assign/worker-id获取任务信息并执行任务。

从节点从本地列表中获取每个任务的信息并验证任务是否还在待执行的队列中，从节点保存一个本地待执行任务的列表就是为了这个目的。

_注意，为了释放回调方法的线程，在单独的线程对从节点的已分配任务进行循环，否则，会阻塞其他的回调方法的执行。_

```java
Watcher newTaskWatcher = new Watcher() {
	@Override
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeChildrenChanged) {
			assert new String("/assign/worker-" + serverId).equals(e.getPath());
			getTasks();
		}
	}
};

void getTasks() {
	zk.getChildren("/assign/worker-" + serverId,
			newTaskWatcher,
			tasksGetChildrenCallback,
			null);
}

protected ChildrenCache assignedTasksCache = new ChildrenCache();

ChildrenCallback tasksGetChildrenCallback = new ChildrenCallback() {
	@Override
	public void processResult(int rc, String path, Object ctx, List<String> children) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				getTasks();
				break;
			case OK:
				if (children != null) {
					// 单独线程中执行任务
					executor.execute(new Runnable() {
						List<String> children;
						DataCallback cb;
						/*
						 * Initializes input of anonymous class
						 */
						public Runnable init(List<String> children, DataCallback cb) {
							this.children = children;
							this.cb = cb;

							return this;
						}
						@Override
						public void run() {
							if (children == null) {
								return;
							}
							LOG.info("Looping into tasks");
							setStatus("Working");
							// 循环子节点列表
							for (String task : children) {
								LOG.trace("New task: {}", task);
								// 获得任务信息并执行
								zk.getData("/assign/worker-" + serverId + "/" + task,
										false,
										cb,
										task);
							}
						}
						// 这里获得未执行的任务，或者在for循环时判断未执行才获得并执行
					}.init(assignedTasksCache.addedAndSet(children), taskDataCallback));
				}
				break;
			default:
				System.out.println("getChildren failed: " + KeeperException.create(Code.get(rc), path));
		}
	}
};
```

**会话事件和监视点**

> 当与服务端的连接断开时（例如，服务端崩溃时），直到连接重新建立前，不会传送任何监视点。因此，会话事件CONNECTIONLOSS会发送给所有已知的监视点进行处理。
> 一般来说，应用使用会话事件进入安全模式：ZooKeeper客户端在失去连接后不会接收任何事件，因此客户端需要继续保持这种状态。
> 在主从应用的例子中，处理提交任务外，其他所有动作都是被动的，所以如果主节点或从节点发生连接断开时，不会触发任何动作。而且在连接断开时，主从应用中的客户端也无法提交新任务以及接收任务状态的通知。

### 客户端等待任务的执行结果

假设应用客户端已经提交了一个任务，现在客户端需要知道该任务何时被执行，以及任务状态。从节点执行执行一个任务时，会在/status下创建一个znode节点。

```java
void submitTask(String task, TaskObject taskCtx) {
	taskCtx.setTask(task);
	zk.create("/tasks/task-",
			task.getBytes(),
			OPEN_ACL_UNSAFE,
			CreateMode.PERSISTENT_SEQUENTIAL,
			createTaskCallback,
			taskCtx);// 传递了一个上下文Task类的实例
}

StringCallback createTaskCallback = new StringCallback() {
	public void processResult(int rc, String path, Object ctx, String name) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				/*
				 * Handling connection loss for a sequential node is a bit
				 * delicate. Executing the ZooKeeper create command again
				 * might lead to duplicate tasks. For now, let's assume
				 * that it is ok to create a duplicate task.
				 */
				// 可能造成重复，暂时忽略
				submitTask(((TaskObject) ctx).getTask(), (TaskObject) ctx);
				break;
			case OK:
				LOG.info("My created task name: " + name);
				((TaskObject) ctx).setTaskName(name);
				// 设置监视点
				watchStatus(name.replace("/tasks/", "/status/"), ctx);
				break;
			default:
				LOG.error("Something went wrong" + KeeperException.create(Code.get(rc), path));
		}
	}
};
```

**有序节点是否创建成功？**

> 在创建有序节点时发生CONNECTIONLOSS事件，处理这种情况比较棘手，因为ZooKeeper每次分配一个序列号，对于连接断开的客户端，无法确认这个节点是否创建成功，
> 尤其是在其他客户端一同并发请求时（并发请求是指多个客户端进行相同的请求）。
> 为了解决这个问题，需要添加一些提示信息来标记这个znode节点的创建者，比如，在任务名称中加入服务器ID等信息，通过这个方法，就可以通过获取所有任务列表来确认任务是否添加成功。

检查状态节点是否已经存在（也许任务很快处理完成），并设置监视点。

```java
protected ConcurrentHashMap<String, Object> ctxMap = new ConcurrentHashMap<String, Object>();
void watchStatus(String path, Object ctx) {
	ctxMap.put(path, ctx);
	// 客户端通过该方法传递上下对象，当收到状态节点的通知时，就可以修改这个表示任务的对象
	zk.exists(path,
			statusWatcher,
			existsCallback,
			ctx);
}

Watcher statusWatcher = new Watcher() {
	public void process(WatchedEvent e) {
		if (e.getType() == EventType.NodeCreated) {
			assert e.getPath().contains("/status/task-");
			assert ctxMap.containsKey(e.getPath());
			zk.getData(e.getPath(),
					false,
					getDataCallback,
					ctxMap.get(e.getPath()));
		}
	}
};

StatCallback existsCallback = new StatCallback() {
	public void processResult(int rc, String path, Object ctx, Stat stat) {
		switch (Code.get(rc)) {
			case CONNECTIONLOSS:
				watchStatus(path, ctx);
				break;
			case OK:
				if (stat != null) {
					// 状态节点已经存在，客户端获取这个节点
					zk.getData(path, false, getDataCallback, ctx);
					LOG.info("Status node is there: " + path);
				}
				break;
			case NONODE:
				// 状态节点不存在，不做任何事情
				break;
			default:
				LOG.error("Something went wrong when " +
						"checking if the status node exists: " +
						KeeperException.create(Code.get(rc), path));

				break;
		}
	}
};
```

### multiop

multiop可以原子性地执行多个ZooKeeper的操作，执行过程为原子性，即在multiop代码块中的所有操作要不全部成功，要不全部失败。

multiop特性：

1. 创建一个Op对象，该对象表示你想通过multiop方法执行的每个ZooKeeper操作，ZooKeeper提供了每个改变状态操作的Op对象的实现：create、delete和setData。
2. 通过Op对象中提供的一个静态方法调用进行操作。
3. 将Op对象添加到Java的Iterable类型对象中，如列表（List）。
4. 使用列表对象调用multi方法。

```java
// 为delete方法创建Op对象
Op deleteZnode(String z) {
	// 通过Op方法返回
	return Op.delete(z, -1);
}
...
// 以列表形式传入每个delete操作的元素执行multi方法
List<OpResult> results = zk.multi(Arrays.asList(deleteZnode("/a/b"),
									deleteZnode("/a"));
```

调用multi方法返回一个OpResult对象的列表，每个对象对应每个操作。
例如，对于delete操作，使用DeleteResult类，该类继承自OpResult，通过每种操作类型对应的结果对象暴露方法和数据。
DeleteResult对象仅提供了equals和hashCode方法，而CreateResult对象暴露出操作的路径（path）和Stat对象。对于错误处理，ZooKeeper返回一个包含错误码的ErrorResult类的实例。

multi方法同样也有异步版本。

```java
public List<OpResult> multi(Iterable<Op> ops) throws InterruptedException, KeeperException;
public void multi(Iterable<Op> ops, MultiCallback cb, Object ctx);
```

multiop可以简化不止一处的主从模式的实现，当分配一个任务，在之前的例子中，主节点会创建任务分配节点，然后删除/tasks下对应的任务节点。
如果在删除/tasks下的节点时，主节点崩溃，就会导致一个已分配的任务还在/tasks下。使用multiop，可以原子化创建任务分配节点和删除/tasks下对应的任务节点这两个操作。
使用这个方式，可以保证没有已分配的任务还在/tasks节点下，如果备份节点接管了主节点角色，就不用再区分/tasks下的任务是不是没有分配的。

Transaction封装了multi方法，提供了简单的接口。可以创建Transaction对象的实例，添加操作，提交事务。

```java
Transaction t = new Transaction();
t.delete("/a/b", -1);
t.delete("/a", -1);
List<OpResult> results = t.commit();
```

commit方法同样也有一个异步版本的方法，该方法以MultiCallback对象和上下文对象为输入。

```java
public void commit(MultiCallback cb, Object ctx);
```

multiop可以简化不止一处的主从模式的实现，当分配一个任务，在之前的例子中，主节点会创建任务分配节点，然后删除/tasks下对应的任务节点。
如果在删除/tasks下的节点时，主节点崩溃，就会导致一个已分配的任务还在/tasks下。使用multiop，可以原子化创建任务分配节点和删除/tasks下对应的任务节点这两个操作。
使用这个方式，可以保证没有已分配的任务还在/tasks节点下，如果备份节点接管了主节点角色，就不用再区分/tasks下的任务是不是没有分配的。

multiop提供的另一个功能是检查一个znode节点的版本，通过multiop可以同时读取的多个节点的ZooKeeper状态并回写数据——如回写某些读取到的数据信息。
当被检查的znode版本号没有变化时，就可以通过multiop调用来检查没有被修改的znode节点的版本号，这个功能非常有用，如在检查一个或多个znode节点的版本号取决于另外一个znode节点的版本号时。

在的主从模式的示例中，主节点需要让客户端在主节点指定的路径下添加新任务，例如，主节点要求客户端在/task-mid的子节点中添加新任务节点，其中mid为主节点的标识符，
主节点在/master-path节点中保存这个路径的数据，客户端在添加新任务前，需要先读取/master-path的数据，并通过Stat获取这个节点的版本号信息，
然后，客户端通过multiop的部分调用方式在/task-mid节点下添加新任务节点，同时会检查/master-path的版本号是否与之前读取的相匹配。

```java
public static Op check(String path, int version);
```

如果输入的path的znode节点的版本号不匹配，multi调用会失败。

```java
// 获取master数据
byte[] masterData = zk.getData("/master-path", false, stat);
String parent = new String(masterData);
...
// 两个操作的multi调用
zk.multi(Arrays.asList(Op.check("/master-path", stat.getVersion()),
                       Op.create("/woker1", modify(z1Data),-1),③
```

_注意，如果在/master节点中以主节点ID来保存路径信息，以上方式就无法正常运行，因为新主节点每次都会创建/master，从而导致/master的版本号始终为1。

### 通过监视点代替显式缓存管理

从应用的角度来看，客户端每次都是通过访问ZooKeeper来获取给定znode节点的数据、一个znode节点的子节点列表或其他相关的ZooKeeper状态，这种方式并不可取。

反而更高效的方式为客户端本地缓存数据，并在需要时使用这些数据，一旦这些数据发生变化，你让ZooKeeper通知客户端，客户端就可以更新缓存的数据。应用的客户端通过注册监视点来接收这些通知消息。
总之，监视点可以让客户端在本地缓存一个版本的数据（比如，一个znode节点数据或节点的子节点列表信息），并在数据发生变化时接收到通知来进行更新。

ZooKeeper的设计者还可以采用另一种方式，客户端透明地缓存客户端访问的所有ZooKeeper状态，并在更新缓存数据时将这些数据置为无效。
实现这种缓存一致性的方案代价非常大，因为客户端也许并不需要缓存所有它们所访问的ZooKeeper状态，
而且服务端需要将缓存状态置为无效，为了实现失效机制，服务端不得不关注每个客户端中缓存的信息，并广播失效请求。
客户端数量很大时，这两方面的代价都非常大，这样也是不可取的。

不管是哪部分负责管理客户端缓存，ZooKeeper直接管理或ZooKeeper应用来管理，都可以通过同步或异步方式进行更新操作的客户端通知。
同步方式使所有持有该状态拷贝的客户端中的状态无效，这种方式效率很低，因为客户端往往以不同的速度运行中，因此缓慢的客户端会强制其他客户端进行等待，随着客户端越来越多，这种差异就会更加频繁发生。

设计者选择的通知方式可视为一种在客户端一侧使ZooKeeper状态失效的异步方式，ZooKeeper将给客户端的通知消息队列化，这些通知会以异步的方式进行消费。
这种失效方案也是可选方案，应用程序中需要解决，对于任何给定的客户端，哪些部分ZooKeeper状态需要置为无效。这种设计的选择更适合ZooKeeper的应用场景。

### 顺序的保障

#### 写操作的顺序

ZooKeeper状态会在所有服务端所组成的全部安装中进行复制。服务端对状态变化的顺序达成一致，并使用相同的顺序执行状态的更新。

例如，如果一个ZooKeeper的服务端执行了先建立一个/z节点的状态变化之后再删除/z节点的状态变化这个顺序的操作，所有的在集合中的服务端均需以相同的顺序执行这些变化。

所有服务端并不需要同时执行这些更新，而且事实上也很少这样操作。服务端更可能在不同时间执行状态变化，因为它们以不同的速度运行，即使它们运行在同种硬件下。
有很多原因会导致这种时滞发生，如操作系统的调度、后台任务等。

对于应用程序来说，在不同时间点执行状态更新并不是问题，因为它们会感知到相同的更新顺序。
应用程序也可能感知这一顺序，但如果ZooKeeper状态通过隐藏通道进行通信时，看下面的《读操作顺序》。

#### 读操作的顺序

ZooKeeper客户端总是会观察到相同的更新顺序，即使它们连接到不同的服务端上。但是客户端可能是在不同时间观察到了更新，如果他们还在ZooKeeper以外通信，这种差异就会更加明显。

考虑以下场景：

* 客户端c1更新了/z节点的数据，并收到应答。
* 客户端c1通过TCP的直接连接告知客户端c2，/z节点状态发生了变化。
* 客户端c2读取/z节点的状态，但是在c1更新之前就观察到了这个状态。

这称之为隐藏通道（hidden channel），因为ZooKeeper并不知道客户端之间额外的通信。现在c2获得了过期数据

![隐藏通道问题的例子](/static/img/2018-08-06-ZooKeeper/2018-08-09-23-54-21.png)

为了避免读取到过去的数据，建议应用程序使用ZooKeeper进行所有涉及ZooKeeper状态的通信。

例如，为了避免描述的场景，c2可以在/z节点设置监视点来代替从c1直接接收消息，通过监视点，c2就可以知道/z节点的变化，从而消除隐藏通道的问题。

#### 通知的顺序

ZooKeeper对通知的排序涉及其他通知和异步响应，以及对系统状态更新的顺序。

如ZooKeeper对两个状态更新进行排序，u和u'，u'紧随u之后，如果u和u'分别修改了/a节点和/b节点，
其中客户端c在/a节点设置了监视点，c只能观察到u'的更新，即接收到u所对应通知后读取/b节点。

这种顺序可以使应用通过监视点实现安全的参数配置。

假设一个znode节点/z被创建或删除表示在ZooKeeper中保存的一些配置信息变为无效的。
在对这个配置进行任何实际更新之前，将创建或删除的通知发给客户端，这一保障非常重要，可以确保客户端不会读取到任何无效配置。

假如有一个znode节点/config，其子节点包含应用配置元数据：/config/m1，/config/m2，...，/config/m_n。
主节点应用进程通过setData更新每个znode节点，且不能让客户端只读取到部分更新。

一个解决方案就是在开始更新这些配置前主节点先创建一个/config/invalid节点，其他需要读取这一状态的客户端会监视/config/invalid节点，
如果该节点存在就不会读取配置状态，当该节点被删除，就意味着有一个新的有效的配置节点集合可用，客户端可以进行读取该集合的操作。

还可以使用multiop来对/config/m[1-n]这些节点原子地执行所有setData操作，而不是使用一个znode节点来标识部分修改的状态。
在例子中的原子性问题，可以使用multiop代替对额外znode节点或通知的依赖，不过通知机制非常通用，而且并未约束为原子性的。

因为ZooKeeper根据触发通知的状态更新对通知消息进行排序，客户端就可以通过这些通知感知到真正的状态变化的顺序。

**活性与安全性**

> 因活性广泛使用了通知机制。活性（liveness）会确保系统最终取得进展。新任务和新的从节点的通知只是关于活性的事件的例子。
> 如果主节点没有对新任务进行通知，这个任务就永远不会被执行，至少从提交任务的客户端的视角来看，已提交的任务没有执行会导致活性缺失。
> 
> 原子更新一组配置节点的例子中，情况不太一样：这个例子涉及安全性，而不是活性。
> 在更新中读取znode节点可能会导致客户端到非一致性配置信息，而invalid节点可以确保只有当合法配置信息有效时，客户端才读取正确状态。
> 
> 在关于活性的例子中，通知的传送顺序并不是特别重要，只要最终客户端最终获知这些事件就可以继续取得进展。
> 不过为了安全性，不按顺序接收通知也许会导致不正确的行为。

### 监视点的羊群效应和可扩展性

当变化发生时，ZooKeeper会触发一个特定的znode节点的变化导致的所有监视点的集合。

如果有1000个客户端通过exists操作监视这个znode节点，那么当znode节点创建后就会发送1000个通知，因而被监视的znode节点的一个变化会产生一个尖峰的通知，该尖峰可能带来影响，例如，在尖峰时刻提交的操作延迟。

可能的话，建议在使用ZooKeeper时，避免在一个特定节点设置大量的监视点，最好是每次在特定的znode节点上，只有少量的客户端设置监视点，理想情况下最多只设置一个。

解决该问题的方法并不适用于所有的情况，但在以下情况下可能很有用：

假设有n个客户端争相获取一个锁（例如，主节点锁）。为了获取锁，一个进程试着创建/lock节点，如果znode节点存在了，客户端就会监视这个znode节点的删除事件。
当/lock被删除时，所有监视/lock节点的客户端收到通知。

另一个不同的方法，让客户端创建一个有序的节点/lock/lock-，ZooKeeper在这个znode节点上自动添加一个序列号，成为/lock/lock-xxx，其中xxx为序列号。
可以使用这个序列号来确定哪个客户端获得锁，通过判断/lock下的所有创建的子节点的最小序列号。

在该方案中，客户端通过/getChildren方法来获取所有/lock下的子节点，并判断自己创建的节点是否是最小的序列号。
如果客户端创建的节点不是最小序列号，就根据序列号确定序列，并在前一个节点上设置监视点。

假设有三个节点：/lock/lock-001、/lock/lock-002和/lock/lock-003：

* 创建/lock/lock-001的客户端获得锁。
* 创建/lock/lock-002的客户端监视/lock/lock-001节点。
* 创建/lock/lock-003的客户端监视/lock/lock-002节点。

这样，每个节点上设置的监视点只有最多一个客户端。

另一方面需要注意的问题，就是当服务端一侧通过监视点产生的状态变化。

设置一个监视点需要在服务端创建一个Watcher对象，根据[YourKit](http://www.yourkit.com/)的分析工具所分析，
设置一个监视点会使服务端的监视点管理器的内存消耗上增加大约250到300个字节，设置非常多的监视点意味着监视点管理器会消耗大量的服务器内存。

例如，如果存在一百万个监视点，估计会消耗0.3GB的内存，因此，开发者必须时刻注意设置的监视点数量。

### 总结

* ZooKeeper提供了跟踪重要事件的有效机制，使系统中的进程可以根据事件进行相应的处理。正常流程的应用（如，任务的执行）或崩溃故障的处理（如主节点崩溃）。
* ZooKeeper的一个重要功能便是通知（notifications）。
	* ZooKeeper客户端通过ZooKeeper来注册监视点，在ZooKeeper状态变化发生时，接收通知。
	* 通知的传送顺序很重要，客户端不可以自己通过某些方式观察ZooKeeper状态变化的顺序。
* 在同时处理多个变化的调用时，一个很有用的功能便是multi方法。
	* 这个功能可以一次执行多个操作，以便在客户端对事件进行响应并改变ZooKeeper的状态时，避免在分布式应用的竞态条件。
* 大多数应用应之前所讨论的模式，即使是该模式的各种变体也可以。
* 专注于异步API，并且建议开发者也使用异步的方式，异步API可以让应用程序更有效地使用ZooKeeper资源，同时获得更高的性能。

## 故障处理

故障发生的主要点有三个：ZooKeeper服务、网络、应用程序。故障恢复取决于所找到的故障发生的具体位置，不过查找具体位置并不是简单的事情。

简单的分布式应用示意图：

![简单的分布式应用示意图](/static/img/2018-08-06-ZooKeeper/2018-08-10-10-43-12.png)

简单结构，只有两个进程组成应用程序，三个服务器组成了ZooKeeper的服务。
进程会随机连接到其中一个服务器，也可能断开后再次连接到另一个不同的服务器，服务器使用内部协议来保持客户端之间状态的同步，对客户端呈现一致性视图。

![简单的分布式系统的故障情况](/static/img/2018-08-06-ZooKeeper/2018-08-10-10-44-56.png)

系统的不同组件中可能发生的一些故障。终点在于如何区分一个应用中不同类型的故障。

例如，如果发生网络故障，c1如何区分网络故障和ZooKeeper服务终端之间的区别？

如果ZooKeeper服务中只有s1服务器停止运行，其他的ZooKeeper服务器还会继续运行，如果此时没有网络问题，c1可以连接到其他的服务器上。
不过，如果c1无法连接到任何服务器，可能是因为当前服务不可用（也许因为集合中大多数服务器停止运行），或因为网络故障导致。

这个例子展示了并不是所有的基于组件中发生的故障都可以被处理，因此ZooKeeper需要呈现系统视图，同时开发者也基于该视图进行开发。

再从c2的视角看，网络故障持续足够长的时间将会导致c1与ZooKeeper之间的会话过期，然而即使c1实际上仍然活着，ZooKeeper还是会因为c1无法与任何服务器通信而声明c1已经为不活动状态。
如果c1正在监视自己创建的临时性节点，就可以收到c1终止的通知，因此c2也将确认c1已经终止，因为ZooKeeper也是如此通知的，即使在这个场景中c1还活着。

在这个场景中，c1无法与ZooKeeper服务进行通信，它自己知道自己活着，但不无法确定ZooKeeper是否声明它的状态是否为终止状态，因此必须以最坏的情况进行假设。
如果c1进行其他操作，但已经中止的进程不应该进行其他操作（例如改变外部资源），这样可能会破坏整个系统。
如果c1再也无法重新连接到ZooKeeper并发现它的会话已经不再处于活动状态，它需要确保整个系统的其他部分的一致性，并中止或执行重启逻辑，以新的进程实例的方式再次连接。

**事后评测ZooKeeper方案**

> 事后评测ZooKeeper的方案的确很诱人。之前也曾经这么做过，遗憾的是，首先问题具有不确定性，如本章之前所介绍的。
> 如果是ZooKeeper发生错误，事后评测也许的确猜测正确了，但如果ZooKeeper正常工作，也许猜测结果是不正确的。ZooKeeper被指定为真实性的源头，系统的设计会更简单，故障也更容易识别和诊断。

### 可恢复的故障

ZooKeeper呈现给使用某些状态的所有客户端进程一致性的状态视图。

当一个客户端从ZooKeeper获得响应时，客户端可以非常肯定这个响应信息与其他响应信息或其他客户端所接收的响应均保持一致性。
有时，ZooKeeper客户端库与ZooKeeper服务的连接会丢失，而且无法提供一致性保障的信息，
当客户端库发现自己处于这种情况时，就会使用Disconnected事件和ConnectionLossException异常来表示自己无法了解当前的系统状态。

ZooKeeper客户端库会积极地尝试，使自己离开这种情况，它会不断尝试重新连接另一个ZooKeeper服务器，直到最终重新建立了会话。

一旦会话重新建立，ZooKeeper会产生一个SyncConnected事件，并开始处理请求。ZooKeeper还会注册之前已经注册过的监视点，并会对失去连接这段时间发生的变更产生监视点事件。

Disconnected事件和ConnectionLossException异常的产生的一个典型原因是因为ZooKeeper服务器故障。

![连接丢失的例子](/static/img/2018-08-06-ZooKeeper/2018-08-10-11-00-13.png)

客户端连接到服务器s2，其中s2是两个活动ZooKeeper服务器中的一个，当s2发生故障，客户端的Watcher对象就会收到Disconnected事件，并且，所有进行中的请求都会返回ConnectionLossException异常。
整个ZooKeeper服务本身依然正常，因为大多数的服务器仍然处于活动状态，所以客户端会快速与新的服务器重新建立会话。

如果客户端没有进行中的请求，这种情况只会对客户端产生很小的影响。紧随Disconnected事件之后为SyncConnected事件，客户端并不会注意到变化，
但是，如果存在进行中的请求，连接丢失就会产生很大的影响。

如果此时客户端正在进行某些请求，比如刚刚提交了一个create操作的请求，当连接丢失发生时，对于同步请求，客户端会得到ConnectionLossException异常，对于异步请求，会得到CONNECTIONLOSS返回码。
然而，客户端无法通过这些异常或返回码来判断请求是否已经被处理，如所看到的，处理连接丢失会使的代码更加复杂，因为应用程序代码必须判断请求是否已经完成。
处理连接丢失这种复杂情况，一个非常糟糕的方法是简单处理，当接收到ConnectionLossException异常或CONNECTIONLOSS返回码时，客户端停止所有工作，并重新启动，虽然这样可以使代码更加简单，但是，本可能是一个小影响，却变为重要的系统事件。

一个以90个客户端进程连接到一个由3个服务器组成的ZooKeeper集群的系统。
如果应用采用了简单却糟糕的方式，现在有一个ZooKeeper服务器发生故障，30个客户端进程将会关闭，然后重启与ZooKeeper的会话，更糟糕的是，
客户端进程在还没有与ZooKeeper连接时就关闭了会话，因此这些会话无法被显式地关闭，ZooKeeper也只能通过会话超时来监测故障。
最后结果是三分之一的应用进程重启，重启却被延迟，因为新的进程必须等待之前旧的会话过期后才可以获得锁。
换句话说，如果应用正确地处理连接丢失，这种情况只会产生很小的系统损坏。

当一个进程失去连接后就无法收到ZooKeeper的更新通知，但是一个进程也许会在会话丢失时错过了某些重要的状态变化。

![活动死节点的影响](/static/img/2018-08-06-ZooKeeper/2018-08-10-12-07-49.png)

客户端c1作为群首，在t2时刻失去了连接，但是并没发现这个情况，直到t4时刻才声明为终止状态，同时，会话在t2时刻过期，
在t3时刻另一个进程成为群首，从t2到t4时刻旧的群首并不知道它自己被声明为终止状态，而另一个群首已经接管控制。

如果开发者不仔细处理，旧的群首会继续担当群首，并且其操作可能与新的群首相冲突。因此，当一个进程接收到Disconnected事件时，在重新连接之前，进程需要挂起群首的操作。
正常情况下，重新连接会很快发生，如果客户端失去连接持续了一段时间，进程也许会选择关闭会话，当然，如果客户端失去连接，关闭会话也不会使ZooKeeper更快地关闭会话，ZooKeeper服务依然会等待会话过期时间过去以后才声明会话已过期。

**很长的延时与过期**

> 当连接丢失发生时，一般情况都会快速地重新连接到另一个服务器，但是网络中断持续了一段时间可能会导致客户端重新连接ZooKeeper服务的一个长延时。
> 一些开发者想要知道为什么ZooKeeper客户端库没有在某些时刻（比如两倍的会话超时时间）做出判断，够了，自己关闭会话吧。
> 
> 对这个问题有两个答案。
> 
> * 首先，ZooKeeper将这种策略问题的决策权交给开发者，开发者可以很容易地实现关闭句柄这种策略。
> * 其次，当整个ZooKeeper集合停机时，时间冻结，然而当整个集合恢复了，会话的超时时间被重置，如果使用ZooKeeper的进程挂起在那里，它们会发现长时间超时是因为ZooKeeper长时间的故障，ZooKeeper恢复后，客户端回到之前的正确状态，进程也就不用额外地重启延迟时间。

#### 已存在的监视点与Disconnected事件

为了使连接断开与重现建立会话之间更加平滑，ZooKeeper客户端库会在新的服务器上重新建立所有已经存在的监视点。
当客户端连接ZooKeeper的服务器，客户端会发送监视点列表和最后已知的zxid（最终状态的时间戳），服务器会接受这些监视点并检查znode节点的修改时间戳与这些监视点是否对应，
如果任何已经监视的znode节点的修改时间戳晚于最后已知的zxid，服务器就会触发这个监视点。

每个ZooKeeper操作都完全符合该逻辑，除了exists。exists操作与其他操作不同，因为这个操作可以在一个不存在的节点上设置监视点。

![通知的特殊情况](/static/img/2018-08-06-ZooKeeper/2018-08-10-16-08-57.png)

这种特殊情况，导致错过了一个设置了监视点的znode节点的创建事件，客户端监视/event节点的创建事件，然而就在/event被另一个客户端创建时，设置了监视点的客户端与ZooKeeper间失去连接，
在这段时间，其他客户端删除了/event，因此当设置了监视点的客户端重新与ZooKeeper建立连接并注册监视点，ZooKeeper服务器已经不存在/event节点了，
因此，当处理已经注册的监视点并判断/event的监视时，发现没有/event这个节点，所以就只是注册了这个监视点，最终导致客户端错过了/event的创建事件。

因为这种特殊情况，你需要尽量避免监视一个znode节点的创建事件，如果一定要监视创建事件，应尽量监视存活期更长的znode节点，否则这种特殊情况可能会伤害你。

**自动重连处理危害**

> 有些ZooKeeper的封装库通过简单的补发命令自动处理连接丢失的故障，有些情况这样做完全可以接受，但有些情况可能会导致错误的结果。
> 
> 例如，如果/leader节点用来建立领导权，你的程序在执行create操作建立/leader节点时连接丢失，而盲目地重试create操作会导致第二个create操作执行失败，
> 因为/leader节点已经存在，因此该进程就会假设其他进程获得了领导权。当然，如果你知道这种情况的可能性，也了解封装库如何工作的，你可以识别并处理这种情况。
> 有些库过于复杂，所以，如果你使用到了这种库，最好能理解ZooKeeper的原理以及该库提供给你的保障机制。

### 不可恢复的故障

有时，一些更糟的事情发生，导致会话无法恢复而必须被关闭。
* 这种情况最常见的原因是会话过期；
* 另一个原因是已认证的会话无法再次与ZooKeeper完成认证。

这两种情况下，ZooKeeper都会丢弃会话的状态。

当客户端无法提供适当的认证信息来完成会话的认证时，或Disconnected事件后客户端重新连接到已过期的会话，就会发生不可恢复的故障。客户端库无法确定自己的会话是否已经失败。

处理不可恢复故障的最简单方法就是中止进程并重启，这样可以使进程恢复原状，通过一个新的会话重新初始化自己的状态。
如果该进程继续工作，首先必须要清除与旧会话关联的应用内部的进程状态信息，然后重新初始化新的状态。

**从不可恢复故障自动恢复的危害**

> 简单地重新创建ZooKeeper句柄以覆盖旧的句柄，通过这种方式从不可恢复的故障中自动恢复，这听起来很吸引人。
> 
> 事实上，早期ZooKeeper实现就是这么做的，但是早期用户注意到这会引发一些问题。
> 认为自己是群首的一个进程的会话中断，但是在通知其他管理线程它不是群首之前，这些线程通过新句柄操作那些只应该被群首访问的数据。
> 为了保证句柄与会话之间一对一的对应关系，ZooKeeper现在避免了这个问题。有些情况自动恢复机制工作得很好，比如客户端只读取数据某些情况，但是如果客户端修改ZooKeeper中的数据，从会话故障中自动恢复的危害就非常重要。

### 群首选举和外部资源

ZooKeeper为所有客户端提供了系统的一致性视图，只要客户端与ZooKeeper进行任何交互操作（例子中所进行的操作），ZooKeeper都会保持同步。
然而，ZooKeeper无法保护与外部设备的交互操作。这种缺乏保护的特殊问题的说明，在实际环境中也经常被发现，常常发生于主机过载的情况下。

当运行客户端进程的主机发生过载，就会开始发生交换、系统颠簸或因已经超负荷的主机资源的竞争而导致的进程延迟，这些都会影响与ZooKeeper交互的及时性。

* 一方面，ZooKeeper无法及时地与ZooKeeper服务器发送心跳信息，导致ZooKeeper的会话超时；
* 另一方面，主机上本地线程的调度会导致不可预知的调度：一个应用线程认为会话仍然处于活动状态，并持有主节点，即使ZooKeeper线程有机会运行时才会通知会话已经超时。

协调外部资源：

![协调外部资源](/static/img/2018-08-06-ZooKeeper/2018-08-10-16-30-03.png)

应用程序通过使用ZooKeeper来确保每次只有一个主节点可以独占访问一个外部资源，这是一个很普遍的资源中心化管理的方法，用来确保一致性。

在时间轴的开始，客户端c1为主节点并独占方案外部资源。事件发生顺序如下：

1. 在t1时刻，因为超载导致与ZooKeeper的通信停止，c1没有响应，c1已经排队等候对外部资源的更新，但是还没收到CPU时钟周期来发送这些更新。
2. 在t2时刻，ZooKeeper声明了c1'与ZooKeeper的会话已经终止，同时删除了所有与c1'会话关联的临时节点，包括用于成为主节点而创建的临时性节点。
3. 在t3时刻，c2成为主节点。
4. 在t4时刻，c2改变了外部资源的状态。
5. 在t5时刻，c1'的负载下降，并发送已队列化的更新到外部资源上。
6. 在t6时刻，c1与ZooKeeper重现建立连接，发现其会话已经过期且丢掉了管理权。遗憾的是，破坏已经发生，在t5 时刻，已经在外部资源进行了更新，最后导致系统状态损坏。

时钟偏移也可能导致类似的问题。因系统超载而导致时钟冻结，有时候，时钟偏移会导致时间变慢甚至落后，使得客户端认为自己还安全地处于超时周期之内，因此仍然具有管理权，尽管其会话已经被ZooKeeper置为过期。

解决这个问题有几个方法：

* 一个方法是确保你的应用不会在超载或时钟偏移的环境中运行，小心监控系统负载可以检测到环境出现问题的可能性，良好设计的多线程应用也可以避免超载，时钟同步程序可以保证系统时钟的同步。
* 另一个方法是通过ZooKeeper扩展对外部设备协作的数据，使用一种名为隔离（fencing）的技巧，分布式系统中常常使用这种方法用于确保资源的独占访问。

如何通过隔离符号来实现一个简单的隔离。只有持有最新符号的客户端，才可以访问资源。

在创建代表群首的节点时，可以获得Stat结构的信息，其中该结构中的成员之一，czxid，表示创建该节点时的zxid，zxid为唯一的单调递增的序列号，因此可以使用czxid作为一个隔离的符号。

当我们对外部资源进行请求时，或我们在连接外部资源时，我们还需要提供这个隔离符号，如果外部资源已经接收到更高版本的隔离符号的请求或连接时，我们的请求或连接就会被拒绝。
也就是说如果一个主节点连接到外部资源开始管理时，若旧的主节点尝试对外币资源进行某些处理，其请求将会失败，这些请求会被隔离开。即使出现系统超载或时钟偏移，隔离技巧依然可以可靠地工作。

![通过ZooKeeper使用隔离](/static/img/2018-08-06-ZooKeeper/2018-08-10-18-28-03.png)

当c1在t1 时刻成为群首，创建/leader节点的zxid为3（真实环境中，zxid为一个很大的数字），在连接数据库时使用创建的zxid值作为隔离符号。
之后，c1因超载而无法响应，在t2时刻，ZooKeeper声明c1终止，c2成为新的群首。c2使用4所作为隔离符号，因为其创建/leader节点的创建zxid为4。
在t3时刻，c2开始使用隔离符号对数据库进行操作请求。在t4 时刻，c1'的请求到达数据库，请求会因传入的隔离符号（3）小于已知的隔离符号（4）而被拒绝，因此避免了系统的破坏。

不过，隔离方案需要修改客户端与资源之间的协议，需要在协议中添加zxid，外部资源也需要持久化保存来跟踪接收到的最新的zxid。

一些外部资源，比如文件服务器，提供局部锁来解决隔离的问题。
不过这种锁也有很多限制，已经被ZooKeeper移出并声明终止状态的群首可能仍然持有一个有效的锁，因此会阻止新选举出的群首获取这个锁而导致无法继续，
在这种情况下，更实际的做法是使用资源锁来确定领导权，为了提供有用信息的目的，由群首创建/leader节点。

### 总结

为了更有效地处理故障，开发者在使用ZooKeeper时需要处理状态变化的事件、故障代码以及ZooKeeper抛出的异常。
不过，不是所有故障在任何情况下都采用一样的方式去处理，有时开发者需要考虑连接断开的状态，或处理连接断开的异常，因为进程并不知道系统其他部分发生了什么，
甚至不知道自己进行中的请求是否已经执行。在连接断开这段时间，进程不能假设系统中的其他部分还在运行中。
即使ZooKeeper客户端库与ZooKeeper服务器重新建立了连接，并重新建立监视点，也需要校验之前进行中的请求的结果是否成功执行。

## ZooKeeper注意事项

### 使用ACL

### 恢复会话

### 当znode节点重新创建时，重置版本号

### sync方法

### 顺序性保障

#### 连接丢失时的顺序性

#### 同步API和多线程的顺序性

#### 同步和异步混合调用的顺序性

### 数据字段和子节点的限制

### 嵌入式ZooKeeper服务

### 总结

## Curator：ZooKeeper API的高级封装库

## ZooKeeper内部原理

## 运行ZooKeeper

---

以上内容总结与《ZooKeeper分布式过程协同技术详解》