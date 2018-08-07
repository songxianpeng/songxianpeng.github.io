---
layout: post
title: Lua
tags: Other
categories: Other
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

如果不让客户端来管理其拥有的ZooKeeper数据的缓存，不得不让ZooKeeper来管理这些应用程序的缓存。但是，这样会导致ZooKeeper的设计更加复杂。
事实上，如果让ZooKeeper管理缓存失效，可能会导致ZooKeeper在运行时，停滞在等待客户端确认一个缓存失效的请求上，因为在进行所有的写操作前，需要确认所有的缓存数据是否已经失效。

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

如果一个客户端与服务器因超时而断开连接，客户端仍然保持CONNECTING状态。  
如果因网络分区问题导致客户端与ZooKeeper集合被隔离而发生连接断开，那么其状态将会一直保持，
直到显式地关闭这个会话，或者分区问题修复后，客户端能够获悉ZooKeeper服务器发送的会话已经过期。
发生这种行为是因为ZooKeeper集合对声明会话超时负责，而不是客户端负责。  
直到客户端获悉ZooKeeper会话过期，否则客户端不能声明自己的会话过期。然而，客户端可以选择关闭会话。

**客户端会尝试连接哪一个服务器？**

在仲裁模式下，客户端有多个服务器可以连接，而在独立模式下，客户端只能尝试重新连接单个服务器。
在仲裁模式中，应用需要传递可用的服务器列表给客户端，告知客户端可以连接的服务器信息并选择一个进行连接。

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

客户端以随机顺序连接到连接串中的服务器。这样可以用ZooKeeper来实现一个简单的负载均衡。不过，客户端无法指定优先选择的服务器来进行连接。

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

请不要自己试着去管理ZooKeeper客户端连接。
ZooKeeper客户端库会监控与服务之间的连接，客户端库不仅告诉连接发生问题，还会主动尝试重新建立通信。
一般客户端开发库会很快重建会话，以便最小化应用的影响。所以不要关闭会话后再启动一个新的会话，这样会增加系统负载，并导致更长时间的中断。

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

因为只有一个单独的线程处理所有回调调用，如果回调函数阻塞，所有后续回调调用都会被阻塞，也就是说，一般不要在回调函数中集中操作或阻塞操作。
有时，在回调函数中调用同步方法是合法的，但一般还是避免这样做，以便后续回调调用可以快速被处理。

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

ZooKeeper会严格地维护执行顺序，并提供了强有力的有序保障，然而，在多线程下还是需要小心面对顺序问题。
多线程下，当回调函数中包括重试逻辑的代码时，一些常见的场景都可能导致错误发生。
当遇到ConnectionLossException异常而补发一个请求时，新建立的请求可能排序在其他线程中的请求之后，而实际上其他线程中的请求应该在原来请求之后。

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

在ZooKeeper的会话状态和znode节点的变化事件中，使用了相同的监视机制来处理应用程序的相关事件的通知。
虽然会话状态的变化和znode状态的变化组成了两个独立的事件集合，为简单其见，使用了相同的机制传送这些事件。

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

### 主节点等待从节点的变化

### 主节点等待新任务进行分配

### 从节点等待分配新任务

### 客户端等待任务的执行结果

### multiop

### 通过监视点代替显式缓存管理

### 顺序的保障

#### 写操作的顺序

#### 读操作的顺序

#### 通知的顺序

### 监视点的羊群效应和可扩展性

## 故障处理

## ZooKeeper注意事项

## Curator：ZooKeeper API的高级封装库

## ZooKeeper内部原理

## 运行ZooKeeper

---

以上内容总结与《ZooKeeper分布式过程协同技术详解》